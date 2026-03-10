/**
 * Cron: Task Reminders — runs at 2 PM UTC (9 AM CT)
 * Sends personalized task reminders to users who have Discord notifications enabled.
 * Each user gets their own reminder with their overdue + due-today + due-tomorrow tasks.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform, config } from "@/lib/supabase/schemas";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  // Get open (non-terminal) status IDs using is_done flag
  const { data: activeStatuses } = await config(supabase)
    .from("task_statuses")
    .select("id, is_done")
    .eq("active", true);

  const openStatusIds = (activeStatuses || [])
    .filter(s => !s.is_done)
    .map(s => s.id);

  if (openStatusIds.length === 0) {
    return NextResponse.json({ message: "No open statuses found", sent: 0 });
  }

  // Get users who have Discord webhook notifications enabled
  const { data: discordPrefs } = await platform(supabase)
    .from("user_notification_prefs")
    .select("user_id, config, channel:notification_channels!user_notification_prefs_channel_id_fkey(slug)")
    .eq("enabled", true);

  const userWebhooks = new Map<string, string>();
  if (discordPrefs) {
    for (const pref of discordPrefs) {
      const channelData = pref.channel as unknown as { slug: string } | { slug: string }[] | null;
      const channelSlug = Array.isArray(channelData) ? channelData[0]?.slug : channelData?.slug;
      const webhookUrl = (pref.config as Record<string, unknown>)?.webhook_url as string | undefined;
      if (channelSlug === "discord" && webhookUrl) {
        userWebhooks.set(pref.user_id, webhookUrl);
      }
    }
  }

  if (userWebhooks.size === 0) {
    return NextResponse.json({ message: "No users with Discord webhooks configured", sent: 0 });
  }

  const userIds = Array.from(userWebhooks.keys());
  let sentCount = 0;

  // Batch: fetch ALL overdue, due-today, and due-tomorrow tasks for all users in 3 queries
  const { data: allOverdue } = await platform(supabase)
    .from("tasks")
    .select("id, title, due_date, owner_ids")
    .lt("due_date", todayStr)
    .in("status_id", openStatusIds)
    .order("due_date", { ascending: true });

  const { data: allDueToday } = await platform(supabase)
    .from("tasks")
    .select("id, title, due_date, owner_ids")
    .eq("due_date", todayStr)
    .in("status_id", openStatusIds)
    .order("created_at", { ascending: true });

  const { data: allDueTomorrow } = await platform(supabase)
    .from("tasks")
    .select("id, title, due_date, owner_ids")
    .eq("due_date", tomorrowStr)
    .in("status_id", openStatusIds)
    .order("created_at", { ascending: true });

  // Group tasks by user
  const userIdSet = new Set(userIds);
  const overdueByUser = new Map<string, typeof allOverdue>();
  const dueTodayByUser = new Map<string, typeof allDueToday>();
  const dueTomorrowByUser = new Map<string, typeof allDueTomorrow>();

  for (const task of allOverdue || []) {
    for (const ownerId of (task.owner_ids as string[]) || []) {
      if (userIdSet.has(ownerId)) {
        if (!overdueByUser.has(ownerId)) overdueByUser.set(ownerId, []);
        overdueByUser.get(ownerId)!.push(task);
      }
    }
  }
  for (const task of allDueToday || []) {
    for (const ownerId of (task.owner_ids as string[]) || []) {
      if (userIdSet.has(ownerId)) {
        if (!dueTodayByUser.has(ownerId)) dueTodayByUser.set(ownerId, []);
        dueTodayByUser.get(ownerId)!.push(task);
      }
    }
  }
  for (const task of allDueTomorrow || []) {
    for (const ownerId of (task.owner_ids as string[]) || []) {
      if (userIdSet.has(ownerId)) {
        if (!dueTomorrowByUser.has(ownerId)) dueTomorrowByUser.set(ownerId, []);
        dueTomorrowByUser.get(ownerId)!.push(task);
      }
    }
  }

  for (const userId of userIds) {
    const overdue = (overdueByUser.get(userId) || []).slice(0, 15);
    const dueToday = (dueTodayByUser.get(userId) || []).slice(0, 15);
    const dueTomorrow = (dueTomorrowByUser.get(userId) || []).slice(0, 10);

    const overdueCount = overdue.length;
    const todayCount = dueToday.length;
    const tomorrowCount = dueTomorrow.length;

    if (overdueCount === 0 && todayCount === 0 && tomorrowCount === 0) {
      continue;
    }

    // Build embed fields
    const fields: { name: string; value: string; inline?: boolean }[] = [];

    if (overdueCount > 0) {
      const lines = overdue.slice(0, 8).map(t => `- **${t.title}** (due ${t.due_date})`);
      if (overdueCount > 8) lines.push(`...and ${overdueCount - 8} more`);
      fields.push({ name: `Overdue (${overdueCount})`, value: lines.join("\n") });
    }

    if (todayCount > 0) {
      const lines = dueToday.slice(0, 8).map(t => `- **${t.title}**`);
      if (todayCount > 8) lines.push(`...and ${todayCount - 8} more`);
      fields.push({ name: `Due Today (${todayCount})`, value: lines.join("\n") });
    }

    if (tomorrowCount > 0) {
      const lines = dueTomorrow.slice(0, 5).map(t => `- ${t.title}`);
      if (tomorrowCount > 5) lines.push(`...and ${tomorrowCount - 5} more`);
      fields.push({ name: `Due Tomorrow (${tomorrowCount})`, value: lines.join("\n") });
    }

    // Determine color and description
    const color = overdueCount > 0 ? 0xef4444 : todayCount > 0 ? 0xf59e0b : 0x3b82f6;
    const description = overdueCount > 0
      ? `You have ${overdueCount} overdue task${overdueCount !== 1 ? "s" : ""}. Get on it.`
      : todayCount > 0
        ? `${todayCount} task${todayCount !== 1 ? "s" : ""} due today.`
        : `${tomorrowCount} task${tomorrowCount !== 1 ? "s" : ""} coming up tomorrow.`;

    const webhookUrl = userWebhooks.get(userId)!;
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "Task Reminders",
            description,
            color,
            fields,
            timestamp: now.toISOString(),
            footer: { text: "The Keep" },
          }],
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        sentCount++;
      } else {
        console.error(`[task-reminders] Webhook failed for user ${userId}:`, res.status);
      }
    } catch (err) {
      console.error(`[task-reminders] Webhook error for user ${userId}:`, err);
    }
  }

  return NextResponse.json({ message: "Task reminders sent", sent: sentCount, users: userIds.length });
}
