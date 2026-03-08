/**
 * Cron: Streak Check — runs at 6 AM UTC (1 AM CT)
 * Checks for habits that missed their check-in window yesterday.
 * Posts streak-at-risk alerts to Discord.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform, config } from "@/lib/supabase/schemas";
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

  // Find the "daily" frequency ID
  const { data: dailyFreq } = await config(supabase)
    .from("habit_frequencies")
    .select("id")
    .eq("target_type", "daily")
    .limit(1)
    .single();

  if (!dailyFreq) {
    return NextResponse.json({ message: "No daily frequency configured", count: 0 });
  }

  // Find active daily habits with active streaks
  const { data: atRisk } = await platform(supabase)
    .from("habits")
    .select("id, title, current_streak, owner_id")
    .eq("frequency_id", dailyFreq.id)
    .gt("current_streak", 0)
    .eq("status", "active");

  if (!atRisk || atRisk.length === 0) {
    return NextResponse.json({ message: "No streaks at risk", count: 0 });
  }

  // Check which ones had a check-in yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const habitIds = atRisk.map(h => h.id);
  const { data: checkins } = await platform(supabase)
    .from("habit_check_ins")
    .select("habit_id")
    .in("habit_id", habitIds)
    .eq("check_date", yesterdayStr);

  const checkedInIds = new Set((checkins || []).map(c => c.habit_id));
  const missed = atRisk.filter(h => !checkedInIds.has(h.id));

  if (missed.length === 0) {
    return NextResponse.json({ message: "All streaks maintained", count: 0 });
  }

  // Fire streak_funeral achievement for 14+ day streaks that just broke
  for (const habit of missed) {
    if (habit.current_streak >= 14) {
      checkAchievements(supabase, habit.owner_id, "custom", {
        custom_type: "streak_broken",
        min_length: habit.current_streak,
      }).catch(() => {});
    }
  }

  // Send in-app notifications per user for their at-risk habits
  const missedByUser = new Map<string, typeof missed>();
  for (const h of missed) {
    if (!missedByUser.has(h.owner_id)) missedByUser.set(h.owner_id, []);
    missedByUser.get(h.owner_id)!.push(h);
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
    `- **${h.title}** (${h.current_streak}-day streak at risk)`
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
