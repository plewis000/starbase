// ============================================================
// FILE: app/api/discord/admin/route.ts
// PURPOSE: Admin actions for Discord — cleanup, post embeds, manage channels
// AUTH: PIPELINE_SECRET
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { sendMessageWithButtons, sendMessage, ZEV_COLOR } from "@/lib/discord";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;
const PIPELINE_CHANNEL_ID = process.env.PIPELINE_CHANNEL_ID!;
const PIPELINE_SECRET = process.env.PIPELINE_SECRET;
const DISCORD_API = "https://discord.com/api/v10";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!PIPELINE_SECRET || auth !== `Bearer ${PIPELINE_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const action = body.action as string;

  if (action === "cleanup") {
    // Wipe all messages from #pipeline
    const channelId = body.channel_id || PIPELINE_CHANNEL_ID;
    const headers = { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" };

    const msgRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=100`, { headers });
    if (!msgRes.ok) return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    const messages = await msgRes.json();

    if (messages.length === 0) return NextResponse.json({ deleted: 0 });

    const messageIds = messages.map((m: { id: string }) => m.id);
    if (messageIds.length >= 2) {
      const bulkRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages/bulk-delete`, {
        method: "POST", headers, body: JSON.stringify({ messages: messageIds }),
      });
      if (!bulkRes.ok) {
        for (const id of messageIds) {
          await fetch(`${DISCORD_API}/channels/${channelId}/messages/${id}`, { method: "DELETE", headers });
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } else {
      await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageIds[0]}`, { method: "DELETE", headers });
    }
    return NextResponse.json({ deleted: messageIds.length });

  } else if (action === "post_feedback") {
    // Post a feedback item to #pipeline with approve/reject buttons
    const feedbackId = body.feedback_id as string;
    if (!feedbackId) return NextResponse.json({ error: "feedback_id required" }, { status: 400 });

    const supabase = createServiceClient();
    const { data: feedback, error } = await platform(supabase)
      .from("feedback")
      .select("id, type, body, status, pipeline_status")
      .eq("id", feedbackId)
      .single();

    if (error || !feedback) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

    const typeEmoji: Record<string, string> = { bug: "🐛", wish: "⭐", feedback: "💬", question: "❓" };
    const messageId = await sendMessageWithButtons(PIPELINE_CHANNEL_ID, {
      embeds: [{
        title: `${typeEmoji[feedback.type] || "💬"} New ${feedback.type}`,
        description: feedback.body.slice(0, 2000),
        color: ZEV_COLOR,
        footer: { text: `ID: ${feedback.id.slice(0, 8)} | Status: ${feedback.status}` },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: "Approve", custom_id: `pipeline_approve_${feedback.id}`, emoji: { name: "✅" } },
          { type: 2, style: 4, label: "Won't Fix", custom_id: `pipeline_wontfix_${feedback.id}`, emoji: { name: "🚫" } },
        ],
      }],
    });

    if (messageId) {
      await platform(supabase).from("feedback").update({ discord_message_id: messageId }).eq("id", feedbackId);
    }

    return NextResponse.json({ posted: true, message_id: messageId });

  } else if (action === "post_message") {
    // Send a plain message to a channel
    const channelId = body.channel_id || PIPELINE_CHANNEL_ID;
    const content = body.content as string;
    if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
    await sendMessage(channelId, content);
    return NextResponse.json({ sent: true });

  } else {
    return NextResponse.json({ error: `Unknown action: ${action}`, available: ["cleanup", "post_feedback", "post_message"] }, { status: 400 });
  }
}
