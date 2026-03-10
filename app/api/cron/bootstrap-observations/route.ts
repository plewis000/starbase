/**
 * Cron: Bootstrap Observations from behavioral data.
 * Runs weekly (after behavioral-aggregates has accumulated data).
 * Analyzes task completion patterns, habit check-in times, and activity rhythms
 * to create high-confidence inferred observations without needing conversation.
 * Also handles failure mode learning: marks ignored suggestions as stale.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: users } = await platform(supabase)
    .from("users")
    .select("id, full_name, household_members!inner(household_id)");

  if (!users || users.length === 0) {
    return NextResponse.json({ message: "No users", bootstrapped: 0 });
  }

  const userIds = users.map((u) => u.id);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // ── BATCH FETCH: all data for all users in parallel ──
  const [
    existingRes,
    completedRes,
    recentCompletionsRes,
    activeHabitsRes,
    aggregatesRes,
    staleSuggestionsRes,
  ] = await Promise.all([
    // 1. All existing active observations
    platform(supabase)
      .from("ai_observations")
      .select("user_id, observation")
      .in("user_id", userIds)
      .eq("is_active", true),

    // 2. All completed tasks in last 30 days for all users
    platform(supabase)
      .from("tasks")
      .select("owner_ids, completed_at")
      .gte("completed_at", thirtyDaysAgo.toISOString())
      .not("completed_at", "is", null)
      .limit(2000),

    // 3. All recent task_completions in last 30 days
    platform(supabase)
      .from("task_completions")
      .select("task_id, completed_by, completed_at")
      .in("completed_by", userIds)
      .gte("completed_at", thirtyDaysAgo.toISOString())
      .limit(2000),

    // 4. All active habit tasks for all users
    platform(supabase)
      .from("tasks")
      .select("owner_ids, title, streak_current, streak_longest")
      .eq("is_habit", true)
      .is("completed_at", null),

    // 5. All behavioral aggregates (last 14 days) for all users
    platform(supabase)
      .from("behavioral_aggregates")
      .select("user_id, tasks_completed, habits_checked, habits_missed, xp_earned, date")
      .in("user_id", userIds)
      .order("date", { ascending: false })
      .limit(userIds.length * 14),

    // 6. All stale suggestions (pending, 14+ days old)
    platform(supabase)
      .from("ai_suggestions")
      .select("id, user_id, title, category")
      .in("user_id", userIds)
      .eq("status", "pending")
      .lt("created_at", fourteenDaysAgo.toISOString()),
  ]);

  // ── GROUP BY USER: build Maps keyed by user ID ──

  // Existing observations per user
  const existingByUser = new Map<string, Set<string>>();
  for (const obs of existingRes.data || []) {
    if (!existingByUser.has(obs.user_id)) existingByUser.set(obs.user_id, new Set());
    existingByUser.get(obs.user_id)!.add(obs.observation.toLowerCase());
  }

  // Completed tasks per user (owner_ids is an array, so a task can belong to multiple users)
  const completedByUser = new Map<string, { completed_at: string }[]>();
  for (const t of completedRes.data || []) {
    const ownerIds: string[] = (t as unknown as { owner_ids: string[] }).owner_ids || [];
    for (const ownerId of ownerIds) {
      if (!userIds.includes(ownerId)) continue;
      if (!completedByUser.has(ownerId)) completedByUser.set(ownerId, []);
      completedByUser.get(ownerId)!.push({ completed_at: t.completed_at! });
    }
  }

  // Recent task_completions per user
  const completionsByUser = new Map<string, { task_id: string; completed_at: string | null }[]>();
  for (const c of recentCompletionsRes.data || []) {
    if (!completionsByUser.has(c.completed_by)) completionsByUser.set(c.completed_by, []);
    completionsByUser.get(c.completed_by)!.push({ task_id: c.task_id, completed_at: c.completed_at });
  }

  // Collect all task IDs from completions that are habits — we need their titles
  const allCompletionTaskIds = new Set<string>();
  for (const comps of completionsByUser.values()) {
    for (const c of comps) allCompletionTaskIds.add(c.task_id);
  }

  // Build habit title map from activeHabitsRes (habit tasks already fetched)
  // Also need to fetch titles for completion task IDs that are habits
  const habitTaskTitleMap = new Map<string, string>();
  for (const h of activeHabitsRes.data || []) {
    habitTaskTitleMap.set((h as unknown as { id: string }).id || "", h.title);
  }

  // If there are completion task IDs not yet in our map, batch fetch them
  const missingTaskIds = [...allCompletionTaskIds].filter((id) => !habitTaskTitleMap.has(id));
  if (missingTaskIds.length > 0) {
    const { data: extraTitles } = await platform(supabase)
      .from("tasks")
      .select("id, title")
      .eq("is_habit", true)
      .in("id", missingTaskIds);
    for (const t of extraTitles || []) {
      habitTaskTitleMap.set(t.id, t.title);
    }
  }

  // Active habits per user (owner_ids is an array)
  const habitsByUser = new Map<string, { title: string; streak_current: number | null; streak_longest: number | null }[]>();
  for (const h of activeHabitsRes.data || []) {
    const ownerIds: string[] = (h as unknown as { owner_ids: string[] }).owner_ids || [];
    for (const ownerId of ownerIds) {
      if (!userIds.includes(ownerId)) continue;
      if (!habitsByUser.has(ownerId)) habitsByUser.set(ownerId, []);
      habitsByUser.get(ownerId)!.push({ title: h.title, streak_current: h.streak_current, streak_longest: h.streak_longest });
    }
  }

  // Behavioral aggregates per user (take first 14 per user, already ordered desc)
  const aggregatesByUser = new Map<string, typeof aggregatesRes.data>();
  for (const a of aggregatesRes.data || []) {
    if (!aggregatesByUser.has(a.user_id)) aggregatesByUser.set(a.user_id, []);
    const userAggs = aggregatesByUser.get(a.user_id)!;
    if (userAggs.length < 14) userAggs.push(a);
  }

  // Stale suggestions per user
  const staleSuggestionsByUser = new Map<string, { id: string; title: string; category: string }[]>();
  for (const s of staleSuggestionsRes.data || []) {
    if (!staleSuggestionsByUser.has(s.user_id)) staleSuggestionsByUser.set(s.user_id, []);
    staleSuggestionsByUser.get(s.user_id)!.push({ id: s.id, title: s.title, category: s.category });
  }

  // ── PROCESS USERS: lookup from Maps, collect inserts ──
  let totalObservations = 0;
  let totalExpired = 0;
  const results: { userId: string; observations: number; suggestionsExpired: number; errors: string[] }[] = [];

  // Collect all observation inserts and stale suggestion IDs for batch writes
  const allObservationInserts: {
    user_id: string;
    household_id: string | null;
    observation_type: string;
    observation: string;
    confidence: number;
    source_layer: string;
    data: Record<string, unknown>;
    tags: string[];
    is_active: boolean;
  }[] = [];
  const allStaleSuggestionIds: string[] = [];

  // Track per-user created counts for results reporting
  const userCreatedCounts = new Map<string, number>();
  const userExpiredCounts = new Map<string, number>();
  const userErrors = new Map<string, string[]>();

  for (const user of users) {
    const errors: string[] = [];
    const householdId = (user as unknown as { household_members: { household_id: string }[] })
      .household_members?.[0]?.household_id || null;

    try {
      const existingSet = existingByUser.get(user.id) || new Set();
      const userName = user.full_name || "User";

      const toInsert: typeof allObservationInserts = [];

      // Helper to check if observation is truly new
      const isNew = (obs: string): boolean => {
        const normalized = obs.toLowerCase();
        for (const e of existingSet) {
          // Prefix overlap
          if (e.startsWith(normalized.slice(0, 30)) || normalized.startsWith(e.slice(0, 30))) return false;
        }
        return true;
      };

      // 1. Task completion patterns — which days does this user complete most tasks?
      const completed = completedByUser.get(user.id) || [];

      if (completed.length >= 10) {
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayCounts = [0, 0, 0, 0, 0, 0, 0];
        const hourCounts = new Array(24).fill(0);

        for (const t of completed) {
          const d = new Date(t.completed_at);
          dayCounts[d.getDay()]++;
          hourCounts[d.getHours()]++;
        }

        // Best completion day
        const maxDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
        const maxDayCount = dayCounts[maxDayIdx];
        const avgPerDay = completed.length / 7;

        if (maxDayCount > avgPerDay * 1.5 && maxDayCount >= 3) {
          const obs = `${userName} completes most tasks on ${dayNames[maxDayIdx]}s (${maxDayCount} in last 30 days)`;
          if (isNew(obs)) {
            toInsert.push({
              user_id: user.id,
              household_id: householdId,
              observation_type: "routine",
              observation: obs,
              confidence: 0.75,
              source_layer: "inferred",
              data: { source: "bootstrap", day_counts: dayCounts },
              tags: ["tasks", "schedule", "pattern"],
              is_active: true,
            });
          }
        }

        // Peak productivity hour
        const maxHour = hourCounts.indexOf(Math.max(...hourCounts));
        const maxHourCount = hourCounts[maxHour];
        if (maxHourCount >= 5) {
          const period = maxHour < 12 ? "morning" : maxHour < 17 ? "afternoon" : "evening";
          const obs = `${userName} is most productive in the ${period} (peak at ${maxHour}:00)`;
          if (isNew(obs)) {
            toInsert.push({
              user_id: user.id,
              household_id: householdId,
              observation_type: "routine",
              observation: obs,
              confidence: 0.7,
              source_layer: "inferred",
              data: { source: "bootstrap", peak_hour: maxHour, count: maxHourCount },
              tags: ["schedule", "productivity", "pattern"],
              is_active: true,
            });
          }
        }
      }

      // 2. Habit completion timing patterns (from task_completions)
      const recentCompletions = completionsByUser.get(user.id) || [];

      if (recentCompletions.length >= 10) {
        const habitHours: Record<string, { title: string; hours: number[] }> = {};
        for (const ci of recentCompletions) {
          const title = habitTaskTitleMap.get(ci.task_id);
          if (!title) continue;
          if (!habitHours[ci.task_id]) habitHours[ci.task_id] = { title, hours: [] };
          if (ci.completed_at) {
            habitHours[ci.task_id].hours.push(new Date(ci.completed_at).getHours());
          }
        }

        for (const [, hData] of Object.entries(habitHours)) {
          if (hData.hours.length >= 7) {
            const avgHour = Math.round(hData.hours.reduce((s, h) => s + h, 0) / hData.hours.length);
            const period = avgHour < 12 ? "morning" : avgHour < 17 ? "afternoon" : "evening";
            const obs = `${userName} typically does "${hData.title}" in the ${period} (around ${avgHour}:00)`;
            if (isNew(obs)) {
              toInsert.push({
                user_id: user.id,
                household_id: householdId,
                observation_type: "routine",
                observation: obs,
                confidence: 0.7,
                source_layer: "inferred",
                data: { source: "bootstrap", avg_hour: avgHour },
                tags: ["habits", "schedule", "pattern"],
                is_active: true,
              });
            }
          }
        }
      }

      // 3. Streak consistency — identify the "reliable" habits
      const activeHabits = habitsByUser.get(user.id) || [];

      for (const h of activeHabits) {
        if ((h.streak_current || 0) >= 14) {
          const obs = `${userName} is very consistent with "${h.title}" (${h.streak_current}-day streak)`;
          if (isNew(obs)) {
            toInsert.push({
              user_id: user.id,
              household_id: householdId,
              observation_type: "routine",
              observation: obs,
              confidence: 0.85,
              source_layer: "inferred",
              data: { source: "bootstrap", streak: h.streak_current },
              tags: ["habits", "consistency", "strength"],
              is_active: true,
            });
          }
        }
      }

      // 4. Behavioral aggregate patterns (activity level)
      const aggregates = aggregatesByUser.get(user.id) || [];

      if (aggregates.length >= 7) {
        const avgTasksPerDay = aggregates.reduce((s, a) => s + (a.tasks_completed || 0), 0) / aggregates.length;
        const avgHabitRate = (() => {
          const checked = aggregates.reduce((s, a) => s + (a.habits_checked || 0), 0);
          const missed = aggregates.reduce((s, a) => s + (a.habits_missed || 0), 0);
          return checked + missed > 0 ? Math.round((checked / (checked + missed)) * 100) : 0;
        })();

        if (avgTasksPerDay >= 2) {
          const obs = `${userName} averages ${avgTasksPerDay.toFixed(1)} task completions per day — high throughput`;
          if (isNew(obs)) {
            toInsert.push({
              user_id: user.id,
              household_id: householdId,
              observation_type: "context",
              observation: obs,
              confidence: 0.75,
              source_layer: "inferred",
              data: { source: "bootstrap", avg_tasks: avgTasksPerDay },
              tags: ["productivity", "pattern"],
              is_active: true,
            });
          }
        }

        if (avgHabitRate >= 80) {
          const obs = `${userName} maintains ${avgHabitRate}% habit check-in rate — very disciplined`;
          if (isNew(obs)) {
            toInsert.push({
              user_id: user.id,
              household_id: householdId,
              observation_type: "personality",
              observation: obs,
              confidence: 0.8,
              source_layer: "inferred",
              data: { source: "bootstrap", habit_rate: avgHabitRate },
              tags: ["habits", "discipline", "strength"],
              is_active: true,
            });
          }
        } else if (avgHabitRate > 0 && avgHabitRate <= 40) {
          const obs = `${userName} struggles with habit consistency (${avgHabitRate}% rate) — may need gentler approach`;
          if (isNew(obs)) {
            toInsert.push({
              user_id: user.id,
              household_id: householdId,
              observation_type: "feedback_pattern",
              observation: obs,
              confidence: 0.65,
              source_layer: "inferred",
              data: { source: "bootstrap", habit_rate: avgHabitRate },
              tags: ["habits", "growth_area"],
              is_active: true,
            });
          }
        }
      }

      // Cap at 5 observations per user per run
      const batch = toInsert.slice(0, 5);
      let created = batch.length;

      // Add to batch collection
      allObservationInserts.push(...batch);

      // ── FAILURE MODE LEARNING: Handle ignored suggestions ──
      const staleSuggestions = staleSuggestionsByUser.get(user.id) || [];
      let suggestionsExpired = 0;

      if (staleSuggestions.length > 0) {
        // Collect IDs for batch update
        allStaleSuggestionIds.push(...staleSuggestions.map((s) => s.id));
        suggestionsExpired = staleSuggestions.length;

        // Create feedback observation: user ignored these categories
        const ignoredCategories = [...new Set(staleSuggestions.map((s) => s.category))];
        for (const cat of ignoredCategories) {
          const count = staleSuggestions.filter((s) => s.category === cat).length;
          if (count >= 2) {
            const obs = `${userName} tends to ignore ${cat} suggestions (${count} expired without action)`;
            if (isNew(obs)) {
              allObservationInserts.push({
                user_id: user.id,
                household_id: householdId,
                observation_type: "feedback_pattern",
                observation: obs,
                confidence: 0.6,
                source_layer: "inferred",
                data: { source: "failure_mode", category: cat, ignored_count: count },
                tags: ["suggestions", "feedback", cat],
                is_active: true,
              });
              created++;
            }
          }
        }
      }

      totalObservations += created;
      totalExpired += suggestionsExpired;
      userCreatedCounts.set(user.id, created);
      userExpiredCounts.set(user.id, suggestionsExpired);
      userErrors.set(user.id, errors);
    } catch (err) {
      userCreatedCounts.set(user.id, 0);
      userExpiredCounts.set(user.id, 0);
      userErrors.set(user.id, [String(err)]);
    }
  }

  // ── BATCH WRITES ──
  const writeErrors: string[] = [];

  // Batch insert all observations
  if (allObservationInserts.length > 0) {
    // Insert in chunks of 100 to avoid payload limits
    for (let i = 0; i < allObservationInserts.length; i += 100) {
      const chunk = allObservationInserts.slice(i, i + 100);
      const { error: insertErr } = await platform(supabase)
        .from("ai_observations")
        .insert(chunk);

      if (insertErr) {
        writeErrors.push(`batch insert chunk ${i}: ${insertErr.message}`);
        // On batch failure, zero out counts for affected users
        const affectedUserIds = new Set(chunk.map((o) => o.user_id));
        for (const uid of affectedUserIds) {
          const prev = userCreatedCounts.get(uid) || 0;
          const inChunk = chunk.filter((o) => o.user_id === uid).length;
          userCreatedCounts.set(uid, Math.max(0, prev - inChunk));
          totalObservations -= inChunk;
        }
      }
    }
  }

  // Batch update stale suggestions to dismissed
  if (allStaleSuggestionIds.length > 0) {
    // Update in chunks of 100
    for (let i = 0; i < allStaleSuggestionIds.length; i += 100) {
      const chunk = allStaleSuggestionIds.slice(i, i + 100);
      const { error: expireErr } = await platform(supabase)
        .from("ai_suggestions")
        .update({ status: "dismissed" })
        .in("id", chunk);

      if (expireErr) {
        writeErrors.push(`expire suggestions chunk ${i}: ${expireErr.message}`);
      }
    }
  }

  // Build results array
  for (const user of users) {
    const errors = userErrors.get(user.id) || [];
    if (writeErrors.length > 0) errors.push(...writeErrors);
    results.push({
      userId: user.id,
      observations: userCreatedCounts.get(user.id) || 0,
      suggestionsExpired: userExpiredCounts.get(user.id) || 0,
      errors,
    });
  }

  return NextResponse.json({
    message: "Observation bootstrap complete",
    total_observations: totalObservations,
    total_suggestions_expired: totalExpired,
    users: users.length,
    results,
  });
}
