/**
 * Cron: Daily Digest — runs at 1 PM UTC (8 AM CT)
 * AI-powered personalized morning briefing for each household member.
 * Uses Zev's voice, includes cross-household data for coordination.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";
import { sendEmbed, ZEV_COLOR, findChannelByName, CHANNELS } from "@/lib/discord";
import { triggerNotification } from "@/lib/notify";
import { generateDailyBriefing } from "@/lib/briefing-engine";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get all active users
  const { data: activeUsers } = await platform(supabase)
    .from("users")
    .select("id, full_name");

  if (!activeUsers || activeUsers.length === 0) {
    return NextResponse.json({ message: "No active users", sent: 0 });
  }

  // Get Discord webhook config for each user
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

  let sentCount = 0;
  const results: { userId: string; sent: boolean; error?: string }[] = [];

  for (const user of activeUsers) {
    try {
      const result = await generateDailyBriefing(supabase, user.id);

      if (!result) {
        results.push({ userId: user.id, sent: false, error: "No data to brief" });
        continue;
      }

      const { briefing, data } = result;
      const userName = user.full_name || "Crawler";

      // Send to Discord via user's webhook (personalized DM-style)
      const webhookUrl = userWebhooks.get(user.id);
      if (webhookUrl) {
        try {
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              embeds: [{
                title: `Morning Briefing — ${userName}`,
                description: briefing,
                color: ZEV_COLOR,
                timestamp: new Date().toISOString(),
                footer: { text: "Zev | The Keep" },
              }],
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) sentCount++;
        } catch (err) {
          console.error(`[daily-digest] Webhook failed for ${user.id}:`, err);
        }
      }

      // Also send to #general as fallback
      const channelId = !webhookUrl ? await findChannelByName(CHANNELS.GENERAL) : null;
      if (channelId) {
        await sendEmbed(channelId, {
          title: `Morning Briefing — ${userName}`,
          description: briefing,
          color: ZEV_COLOR,
          timestamp: new Date().toISOString(),
          footer: { text: "Zev | The Keep" },
        });
        sentCount++;
      }

      // In-app notification with summary
      const summaryTitle = data.overdueTaskCount > 0
        ? `${data.overdueTaskCount} overdue, ${data.todayTaskCount} due today`
        : data.todayTaskCount > 0
          ? `${data.todayTaskCount} task${data.todayTaskCount !== 1 ? "s" : ""} due today`
          : "All clear today";

      triggerNotification(supabase, {
        recipientUserId: user.id,
        title: `Morning Briefing: ${summaryTitle}`,
        body: briefing.slice(0, 300),
        event: "daily_digest",
      }).catch((err) => console.error("[daily-digest] notification failed:", err));

      results.push({ userId: user.id, sent: true });
    } catch (err) {
      results.push({ userId: user.id, sent: false, error: String(err) });
    }
  }

  return NextResponse.json({
    message: "Daily briefings generated",
    sent: sentCount,
    users: activeUsers.length,
    results,
  });
}
