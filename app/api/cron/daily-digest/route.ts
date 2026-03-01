/**
 * Cron: Daily Digest — runs at 1 PM UTC (8 AM CT)
 * Posts overdue tasks and today's due items to Discord.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";
import { sendEmbed, ZEV_COLOR } from "@/lib/discord";

export async function GET(request: NextRequest) {
  // Verify Vercel cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Fetch overdue tasks
  const { data: overdue } = await platform(supabase)
    .from("tasks")
    .select("id, title, due_date, assigned_to")
    .lt("due_date", todayStr)
    .in("status_slug", ["open", "in_progress"])
    .order("due_date", { ascending: true })
    .limit(20);

  // Fetch tasks due today
  const { data: dueToday } = await platform(supabase)
    .from("tasks")
    .select("id, title, due_date, assigned_to")
    .eq("due_date", todayStr)
    .in("status_slug", ["open", "in_progress"])
    .order("priority_order", { ascending: true })
    .limit(20);

  const channelId = process.env.PIPELINE_CHANNEL_ID;
  if (!channelId) {
    return NextResponse.json({ error: "No PIPELINE_CHANNEL_ID" }, { status: 500 });
  }

  const overdueCount = overdue?.length || 0;
  const todayCount = dueToday?.length || 0;

  if (overdueCount === 0 && todayCount === 0) {
    return NextResponse.json({ message: "Nothing to report", overdue: 0, today: 0 });
  }

  const fields: { name: string; value: string; inline?: boolean }[] = [];

  if (overdueCount > 0) {
    const lines = overdue!.slice(0, 10).map(t =>
      `- **${t.title}** (due ${t.due_date})`
    );
    if (overdueCount > 10) lines.push(`...and ${overdueCount - 10} more`);
    fields.push({ name: `Overdue (${overdueCount})`, value: lines.join("\n") });
  }

  if (todayCount > 0) {
    const lines = dueToday!.slice(0, 10).map(t => `- **${t.title}**`);
    if (todayCount > 10) lines.push(`...and ${todayCount - 10} more`);
    fields.push({ name: `Due Today (${todayCount})`, value: lines.join("\n") });
  }

  await sendEmbed(channelId, {
    title: "Daily Digest",
    description: overdueCount > 0
      ? `You've got ${overdueCount} overdue task${overdueCount !== 1 ? "s" : ""}. Handle it.`
      : `${todayCount} task${todayCount !== 1 ? "s" : ""} due today.`,
    color: overdueCount > 0 ? 0xef4444 : ZEV_COLOR,
    fields,
    footer: { text: "Desperado Club Daily Digest" },
    timestamp: now.toISOString(),
  });

  return NextResponse.json({ message: "Digest sent", overdue: overdueCount, today: todayCount });
}
