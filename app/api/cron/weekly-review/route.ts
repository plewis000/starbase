/**
 * Cron: Weekly Review — runs at 2 PM UTC (9 AM CT) on Sundays
 * AI-powered weekly household review for each member.
 * Synthesizes the week's data into an actionable summary.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";
import { sendEmbed, ZEV_COLOR } from "@/lib/discord";
import { triggerNotification } from "@/lib/notify";
import { generateWeeklyReview } from "@/lib/briefing-engine";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: activeUsers } = await platform(supabase)
    .from("users")
    .select("id, full_name");

  if (!activeUsers || activeUsers.length === 0) {
    return NextResponse.json({ message: "No active users", sent: 0 });
  }

  // Get Discord webhooks
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
      const result = await generateWeeklyReview(supabase, user.id);

      if (!result) {
        results.push({ userId: user.id, sent: false, error: "No data for review" });
        continue;
      }

      const { review, data } = result;
      const userName = user.full_name || "Crawler";

      // Send via Discord webhook
      const webhookUrl = userWebhooks.get(user.id);
      if (webhookUrl) {
        try {
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              embeds: [{
                title: `Weekly Review — ${userName}`,
                description: review.slice(0, 4000), // Discord embed limit
                color: ZEV_COLOR,
                timestamp: new Date().toISOString(),
                footer: { text: "Zev | Weekly Review" },
              }],
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) sentCount++;
        } catch (err) {
          console.error(`[weekly-review] Webhook failed for ${user.id}:`, err);
        }
      }

      // Shared channel fallback
      const channelId = process.env.PIPELINE_CHANNEL_ID;
      if (channelId && !webhookUrl) {
        await sendEmbed(channelId, {
          title: `Weekly Review — ${userName}`,
          description: review.slice(0, 4000),
          color: ZEV_COLOR,
          timestamp: new Date().toISOString(),
          footer: { text: "Zev | Weekly Review" },
        });
        sentCount++;
      }

      // In-app notification
      triggerNotification(supabase, {
        recipientUserId: user.id,
        title: `Weekly Review: ${data.tasksCompleted} tasks, ${data.habitsCompletionRate}% habits`,
        body: review.slice(0, 300),
        event: "weekly_review",
      }).catch((err) => console.error("[weekly-review] notification failed:", err));

      results.push({ userId: user.id, sent: true });
    } catch (err) {
      results.push({ userId: user.id, sent: false, error: String(err) });
    }
  }

  return NextResponse.json({
    message: "Weekly reviews generated",
    sent: sentCount,
    users: activeUsers.length,
    results,
  });
}
