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

  let totalObservations = 0;
  let totalExpired = 0;
  const results: { userId: string; observations: number; suggestionsExpired: number; errors: string[] }[] = [];

  for (const user of users) {
    const errors: string[] = [];
    let created = 0;
    const householdId = (user as unknown as { household_members: { household_id: string }[] })
      .household_members?.[0]?.household_id || null;

    try {
      // Load existing observations to avoid duplicates
      const { data: existing } = await platform(supabase)
        .from("ai_observations")
        .select("observation")
        .eq("user_id", user.id)
        .eq("is_active", true);

      const existingSet = new Set((existing || []).map((o) => o.observation.toLowerCase()));
      const userName = user.full_name || "User";

      const toInsert: {
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
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: completed } = await platform(supabase)
        .from("tasks")
        .select("completed_at")
        .contains("owner_ids", [user.id])
        .gte("completed_at", thirtyDaysAgo.toISOString())
        .not("completed_at", "is", null)
        .limit(200);

      if (completed && completed.length >= 10) {
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayCounts = [0, 0, 0, 0, 0, 0, 0];
        const hourCounts = new Array(24).fill(0);

        for (const t of completed) {
          const d = new Date(t.completed_at!);
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
      const { data: recentCompletions } = await platform(supabase)
        .from("task_completions")
        .select("task_id, completed_at")
        .eq("completed_by", user.id)
        .gte("completed_at", thirtyDaysAgo.toISOString())
        .limit(200);

      // Get habit-task titles for completions
      const completionTaskIds = [...new Set((recentCompletions || []).map(c => c.task_id))];
      let taskTitleMap = new Map<string, string>();
      if (completionTaskIds.length > 0) {
        const { data: taskTitles } = await platform(supabase)
          .from("tasks")
          .select("id, title")
          .eq("is_habit", true)
          .in("id", completionTaskIds);
        for (const t of taskTitles || []) {
          taskTitleMap.set(t.id, t.title);
        }
      }

      if (recentCompletions && recentCompletions.length >= 10) {
        const habitHours: Record<string, { title: string; hours: number[] }> = {};
        for (const ci of recentCompletions) {
          const title = taskTitleMap.get(ci.task_id);
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
      const { data: activeHabits } = await platform(supabase)
        .from("tasks")
        .select("title, streak_current, streak_longest")
        .eq("is_habit", true)
        .contains("owner_ids", [user.id])
        .is("completed_at", null);

      for (const h of activeHabits || []) {
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
      const { data: aggregates } = await platform(supabase)
        .from("behavioral_aggregates")
        .select("tasks_completed, habits_checked, habits_missed, xp_earned")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(14);

      if (aggregates && aggregates.length >= 7) {
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
      if (batch.length > 0) {
        const { error: insertErr } = await platform(supabase)
          .from("ai_observations")
          .insert(batch);

        if (insertErr) {
          errors.push(`insert: ${insertErr.message}`);
        } else {
          created = batch.length;
        }
      }

      // ── FAILURE MODE LEARNING: Handle ignored suggestions ──
      // Suggestions pending for 14+ days with no interaction = user doesn't care
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data: staleSuggestions } = await platform(supabase)
        .from("ai_suggestions")
        .select("id, title, category")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .lt("created_at", fourteenDaysAgo.toISOString());

      let suggestionsExpired = 0;
      if (staleSuggestions && staleSuggestions.length > 0) {
        // Mark as expired (new status)
        const { error: expireErr } = await platform(supabase)
          .from("ai_suggestions")
          .update({ status: "dismissed" })
          .in("id", staleSuggestions.map(s => s.id));

        if (!expireErr) {
          suggestionsExpired = staleSuggestions.length;

          // Create feedback observation: user ignored these categories
          const ignoredCategories = [...new Set(staleSuggestions.map(s => s.category))];
          for (const cat of ignoredCategories) {
            const count = staleSuggestions.filter(s => s.category === cat).length;
            if (count >= 2) {
              const obs = `${userName} tends to ignore ${cat} suggestions (${count} expired without action)`;
              if (isNew(obs)) {
                await platform(supabase)
                  .from("ai_observations")
                  .insert({
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
        } else {
          errors.push(`expire suggestions: ${expireErr.message}`);
        }
      }

      totalObservations += created;
      totalExpired += suggestionsExpired;
      results.push({ userId: user.id, observations: created, suggestionsExpired, errors });
    } catch (err) {
      results.push({ userId: user.id, observations: 0, suggestionsExpired: 0, errors: [String(err)] });
    }
  }

  return NextResponse.json({
    message: "Observation bootstrap complete",
    total_observations: totalObservations,
    total_suggestions_expired: totalExpired,
    users: users.length,
    results,
  });
}
