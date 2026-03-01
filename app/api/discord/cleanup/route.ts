// One-time cleanup endpoint — delete all messages from #pipeline channel
// DELETE after use
import { NextRequest, NextResponse } from "next/server";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;
const PIPELINE_CHANNEL_ID = process.env.PIPELINE_CHANNEL_ID!;
const PIPELINE_SECRET = process.env.PIPELINE_SECRET;
const DISCORD_API = "https://discord.com/api/v10";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!PIPELINE_SECRET || auth !== `Bearer ${PIPELINE_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const headers = { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" };

  // Fetch messages
  const msgRes = await fetch(`${DISCORD_API}/channels/${PIPELINE_CHANNEL_ID}/messages?limit=100`, { headers });
  if (!msgRes.ok) return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  const messages = await msgRes.json();

  if (messages.length === 0) return NextResponse.json({ deleted: 0 });

  // Bulk delete if 2+ messages (must be <14 days old)
  const messageIds = messages.map((m: { id: string }) => m.id);

  if (messageIds.length >= 2) {
    const bulkRes = await fetch(`${DISCORD_API}/channels/${PIPELINE_CHANNEL_ID}/messages/bulk-delete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: messageIds }),
    });
    if (!bulkRes.ok) {
      // Fallback to individual deletes
      for (const id of messageIds) {
        await fetch(`${DISCORD_API}/channels/${PIPELINE_CHANNEL_ID}/messages/${id}`, { method: "DELETE", headers });
        await new Promise(r => setTimeout(r, 500)); // Rate limit
      }
    }
  } else {
    await fetch(`${DISCORD_API}/channels/${PIPELINE_CHANNEL_ID}/messages/${messageIds[0]}`, { method: "DELETE", headers });
  }

  return NextResponse.json({ deleted: messageIds.length });
}
