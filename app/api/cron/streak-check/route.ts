/**
 * Cron: Streak Check — runs at 6 AM UTC (1 AM CT)
 * Checks for habits that missed their check-in window yesterday.
 * Posts streak-at-risk alerts to Discord.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";
import { sendEmbed, SYSTEM_COLOR } from "@/lib/discord";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find daily habits with active streaks that didn't check in yesterday
  const { data: atRisk } = await platform(supabase)
    .from("habits")
    .select("id, name, current_streak, user_id, frequency")
    .eq("frequency", "daily")
    .gt("current_streak", 0)
    .eq("archived", false);

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
    .gte("checked_at", `${yesterdayStr}T00:00:00`)
    .lt("checked_at", `${yesterdayStr}T23:59:59`);

  const checkedInIds = new Set((checkins || []).map(c => c.habit_id));
  const missed = atRisk.filter(h => !checkedInIds.has(h.id));

  if (missed.length === 0) {
    return NextResponse.json({ message: "All streaks maintained", count: 0 });
  }

  const channelId = process.env.PIPELINE_CHANNEL_ID;
  if (!channelId) {
    return NextResponse.json({ error: "No PIPELINE_CHANNEL_ID" }, { status: 500 });
  }

  const lines = missed.slice(0, 10).map(h =>
    `- **${h.name}** (${h.current_streak}-day streak at risk)`
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
