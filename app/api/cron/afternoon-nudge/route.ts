/**
 * Cron: Afternoon Nudge — runs at 9 PM UTC (4 PM CT)
 * Mid-afternoon check: unchecked habits, approaching deadlines, proactive suggestions.
 * Only nudges users at tentative+ proactivity level.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform, config } from "@/lib/supabase/schemas";
import { triggerNotification } from "@/lib/notify";
import { getProactivityState, shouldSuggest } from "@/lib/agent/proactivity";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: activeUsers } = await platform(supabase)
    .from("users")
    .select("id, full_name");

  if (!activeUsers || activeUsers.length === 0) {
    return NextResponse.json({ message: "No active users", nudged: 0 });
  }

  const memberIds = activeUsers.map((u) => u.id);

  // --- Batch queries: fetch all data upfront instead of per-user ---

  // Config query — same for all users, fetch once
  const { data: activeStatuses } = await config(supabase)
    .from("task_statuses")
    .select("id, is_done")
    .eq("active", true);

  const openStatusIds = (activeStatuses || [])
    .filter((s) => !s.is_done)
    .map((s) => s.id);

  // Batch: all active habits for all users
  const { data: allHabits } = await platform(supabase)
    .from("tasks")
    .select("id, title, streak_current, owner_ids")
    .eq("is_habit", true)
    .overlaps("owner_ids", memberIds)
    .is("completed_at", null);

  // Batch: all today's check-ins for all users
  const { data: allCheckIns } = await platform(supabase)
    .from("task_completions")
    .select("task_id, completed_by")
    .in("completed_by", memberIds)
    .eq("completed_date", todayStr);

  // Batch: all due-today tasks for all users (only if we have open statuses)
  const allDueTodayTasks = openStatusIds.length > 0
    ? (await platform(supabase)
        .from("tasks")
        .select("title, owner_ids")
        .eq("due_date", todayStr)
        .in("status_id", openStatusIds)
        .overlaps("owner_ids", memberIds)).data
    : null;

  // Batch: all pending suggestions for all users
  const { data: allSuggestions } = await platform(supabase)
    .from("ai_suggestions")
    .select("user_id, title, confidence, priority")
    .in("user_id", memberIds)
    .eq("status", "pending")
    .order("priority", { ascending: false });

  // --- Group batch results into Maps keyed by user ID ---

  // Habits by user: owner_ids is an array, so a habit can belong to multiple users
  const habitsByUser = new Map<string, typeof allHabits>();
  for (const habit of allHabits || []) {
    const owners = (habit.owner_ids as string[]) || [];
    for (const ownerId of owners) {
      if (!habitsByUser.has(ownerId)) habitsByUser.set(ownerId, []);
      habitsByUser.get(ownerId)!.push(habit);
    }
  }

  // Check-ins by user
  const checkInsByUser = new Map<string, Set<string>>();
  for (const ci of allCheckIns || []) {
    if (!checkInsByUser.has(ci.completed_by)) checkInsByUser.set(ci.completed_by, new Set());
    checkInsByUser.get(ci.completed_by)!.add(ci.task_id);
  }

  // Due-today tasks by user
  const dueTodayByUser = new Map<string, { title: string }[]>();
  for (const task of allDueTodayTasks || []) {
    const owners = (task.owner_ids as string[]) || [];
    for (const ownerId of owners) {
      if (!dueTodayByUser.has(ownerId)) dueTodayByUser.set(ownerId, []);
      dueTodayByUser.get(ownerId)!.push({ title: task.title });
    }
  }

  // Suggestions by user — keep only top 1 per user (already sorted by priority desc)
  const suggestionByUser = new Map<string, { title: string; confidence: number | null }>();
  for (const sug of allSuggestions || []) {
    if (!suggestionByUser.has(sug.user_id)) {
      suggestionByUser.set(sug.user_id, { title: sug.title, confidence: sug.confidence });
    }
  }

  let nudgeCount = 0;
  const results: { userId: string; nudged: boolean; reason?: string }[] = [];

  for (const user of activeUsers) {
    try {
      // Check proactivity level — don't nudge users in "observe" mode
      const proactivity = await getProactivityState(supabase, user.id);
      if (proactivity.level === "observe") {
        results.push({ userId: user.id, nudged: false, reason: "observe mode" });
        continue;
      }

      const nudges: string[] = [];
      const userName = user.full_name || "there";

      // 1. Check unchecked habits (backed by tasks with is_habit=true)
      const activeHabits = habitsByUser.get(user.id) || [];
      const checkedIds = checkInsByUser.get(user.id) || new Set<string>();
      const unchecked = activeHabits.filter((h) => !checkedIds.has(h.id));

      if (unchecked.length > 0) {
        // Sort by streak length descending — longest streaks are most precious
        const atRisk = unchecked
          .filter((h) => (h.streak_current || 0) > 0)
          .sort((a, b) => (b.streak_current || 0) - (a.streak_current || 0));

        if (atRisk.length > 0) {
          // Urgency tiers based on streak length
          const critical = atRisk.filter((h) => (h.streak_current || 0) >= 14);
          const important = atRisk.filter((h) => (h.streak_current || 0) >= 7 && (h.streak_current || 0) < 14);
          const moderate = atRisk.filter((h) => (h.streak_current || 0) > 0 && (h.streak_current || 0) < 7);

          if (critical.length > 0) {
            const names = critical.map((h) => `${h.title} (${h.streak_current}d)`).join(", ");
            nudges.push(`CRITICAL — Don't lose these streaks: ${names}. Check in NOW.`);
          }
          if (important.length > 0) {
            const names = important.map((h) => `${h.title} (${h.streak_current}d)`).join(", ");
            nudges.push(`Streaks at risk: ${names}. Check in before midnight.`);
          }
          if (moderate.length > 0 && critical.length === 0) {
            const names = moderate.slice(0, 3).map((h) => `${h.title} (${h.streak_current}d)`).join(", ");
            nudges.push(`${moderate.length} habit${moderate.length > 1 ? "s" : ""} building momentum: ${names}`);
          }
        } else {
          nudges.push(`${unchecked.length} habit${unchecked.length > 1 ? "s" : ""} unchecked today.`);
        }
      }

      // 2. Check tasks due today that aren't done
      const userDueToday = dueTodayByUser.get(user.id) || [];
      if (userDueToday.length > 0) {
        const limited = userDueToday.slice(0, 5);
        const names = limited.slice(0, 3).map((t) => t.title).join(", ");
        nudges.push(`${limited.length} task${limited.length > 1 ? "s" : ""} due today: ${names}`);
      }

      // 3. Surface a pending suggestion (if proactivity allows)
      const sug = suggestionByUser.get(user.id);
      if (sug) {
        if (shouldSuggest(proactivity.level, sug.confidence || 0.5)) {
          nudges.push(`Suggestion: ${sug.title}`);
        }
      }

      // 4. Partner awareness — friendly motivation (kept as per-user queries)
      const { getHouseholdContext, getHouseholdMemberIds } = await import("@/lib/household");
      const hCtx = await getHouseholdContext(supabase, user.id);
      if (hCtx) {
        const allMembers = await getHouseholdMemberIds(supabase, hCtx.household_id);
        const partnerIds = allMembers.filter((id) => id !== user.id);
        if (partnerIds.length > 0) {
          const partnerId = partnerIds[0];
          // Look up partner name from activeUsers first, fall back to query
          const partnerUser = activeUsers.find((u) => u.id === partnerId);
          const partnerName = partnerUser?.full_name || "Your partner";

          // Use batched data for partner habits/check-ins too
          const partnerHabits = habitsByUser.get(partnerId) || [];
          const partnerCheckedIds = checkInsByUser.get(partnerId) || new Set<string>();
          const pTotal = partnerHabits.length;
          const pChecked = partnerHabits.filter((h) => partnerCheckedIds.has(h.id)).length;
          const userChecked = activeHabits.length - unchecked.length;
          const userTotal = activeHabits.length;

          if (pTotal > 0 && pChecked === pTotal && unchecked.length > 0) {
            nudges.push(`${partnerName} already finished all ${pChecked} habits today. You're at ${userChecked}/${userTotal}.`);
          } else if (pTotal > 0 && pChecked > userChecked && unchecked.length > 0) {
            nudges.push(`${partnerName} is at ${pChecked}/${pTotal} habits. You're at ${userChecked}/${userTotal}.`);
          }
        }
      }

      if (nudges.length === 0) {
        results.push({ userId: user.id, nudged: false, reason: "nothing to nudge" });
        continue;
      }

      // Build nudge notification
      const body = nudges.join("\n");
      const title = nudges.length === 1
        ? nudges[0].slice(0, 60)
        : `${nudges.length} items need attention`;

      await triggerNotification(supabase, {
        recipientUserId: user.id,
        title: `Afternoon check-in, ${userName}`,
        body,
        event: "system",
      });

      // Also send via Discord webhook if available
      const { data: discordPrefs } = await platform(supabase)
        .from("user_notification_prefs")
        .select("config, channel:notification_channels!user_notification_prefs_channel_id_fkey(slug)")
        .eq("user_id", user.id)
        .eq("enabled", true);

      if (discordPrefs) {
        for (const pref of discordPrefs) {
          const channelData = pref.channel as unknown as { slug: string } | { slug: string }[] | null;
          const channelSlug = Array.isArray(channelData) ? channelData[0]?.slug : channelData?.slug;
          const webhookUrl = (pref.config as Record<string, unknown>)?.webhook_url as string | undefined;
          if (channelSlug === "discord" && webhookUrl) {
            try {
              await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  embeds: [{
                    title: `Afternoon Check-in`,
                    description: `Hey ${userName} — ${body}`,
                    color: 0xF59E0B, // Amber
                    timestamp: new Date().toISOString(),
                    footer: { text: "Zev | The Keep" },
                  }],
                }),
                signal: AbortSignal.timeout(8000),
              });
            } catch (err) {
              console.error(`[afternoon-nudge] Webhook failed for ${user.id}:`, err);
            }
          }
        }
      }

      nudgeCount++;
      results.push({ userId: user.id, nudged: true });
    } catch (err) {
      results.push({ userId: user.id, nudged: false, reason: String(err) });
    }
  }

  return NextResponse.json({
    message: "Afternoon nudges sent",
    nudged: nudgeCount,
    users: activeUsers.length,
    results,
  });
}
