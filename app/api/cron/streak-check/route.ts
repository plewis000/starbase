/**
 * Cron: Streak Check — runs at 6 AM UTC (1 AM CT)
 * Checks for habit-tasks that missed their check-in window yesterday.
 * Posts streak-at-risk alerts to Discord.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";
import { sendEmbed, SYSTEM_COLOR, findChannelByName, CHANNELS } from "@/lib/discord";
import { checkAchievements } from "@/lib/gamification";
import { triggerNotification } from "@/lib/notify";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find active daily habit-tasks with active streaks
  // Daily habits have FREQ=DAILY in their recurrence_rule
  const { data: atRisk } = await platform(supabase)
    .from("tasks")
    .select("id, title, streak_current, owner_ids")
    .eq("is_habit", true)
    .is("completed_at", null)
    .gt("streak_current", 0)
    .ilike("recurrence_rule", "%FREQ=DAILY%");

  if (!atRisk || atRisk.length === 0) {
    return NextResponse.json({ message: "No streaks at risk", count: 0 });
  }

  // Check which ones had a completion yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const y = yesterday;
  const yesterdayStr = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;

  const taskIds = atRisk.map(h => h.id);
  const { data: completions } = await platform(supabase)
    .from("task_completions")
    .select("task_id")
    .in("task_id", taskIds)
    .eq("completed_date", yesterdayStr);

  const completedIds = new Set((completions || []).map(c => c.task_id));
  const missed = atRisk.filter(h => !completedIds.has(h.id));

  if (missed.length === 0) {
    return NextResponse.json({ message: "All streaks maintained", count: 0 });
  }

  // Fire streak_funeral achievement for 14+ day streaks that just broke
  for (const habit of missed) {
    const ownerId = Array.isArray(habit.owner_ids) ? habit.owner_ids[0] : null;
    if (ownerId && (habit.streak_current || 0) >= 14) {
      checkAchievements(supabase, ownerId, "custom", {
        custom_type: "streak_broken",
        min_length: habit.streak_current,
      }).catch(() => {});
    }
  }

  // Send in-app notifications per user for their at-risk habits
  const missedByUser = new Map<string, typeof missed>();
  for (const h of missed) {
    const ownerId = Array.isArray(h.owner_ids) ? h.owner_ids[0] : null;
    if (!ownerId) continue;
    if (!missedByUser.has(ownerId)) missedByUser.set(ownerId, []);
    missedByUser.get(ownerId)!.push(h);
  }
  for (const [userId, habits] of missedByUser) {
    const names = habits.slice(0, 3).map(h => h.title).join(", ");
    const suffix = habits.length > 3 ? ` +${habits.length - 3} more` : "";
    triggerNotification(supabase, {
      recipientUserId: userId,
      title: `${habits.length} streak${habits.length > 1 ? "s" : ""} at risk`,
      body: `Check in today or lose: ${names}${suffix}`,
      event: "streak_broken",
    }).catch(() => {});
  }

  const channelId = await findChannelByName(CHANNELS.GENERAL);
  if (!channelId) {
    return NextResponse.json({ error: "No #general channel found" }, { status: 500 });
  }

  const lines = missed.slice(0, 10).map(h =>
    `- **${h.title}** (${h.streak_current}-day streak at risk)`
  );
  if (missed.length > 10) lines.push(`...and ${missed.length - 10} more`);

  await sendEmbed(channelId, {
    title: "Streaks at Risk",
    description: `${missed.length} habit${missed.length !== 1 ? "s" : ""} missed check-in yesterday. Check in today or lose the streak.`,
    color: SYSTEM_COLOR,
    fields: [{ name: "Habits", value: lines.join("\n") }],
    footer: { text: "The System is watching." },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ message: "Streak alerts sent", count: missed.length });
}
