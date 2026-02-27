import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getGuildChannels,
  createCategory,
  createChannel,
  registerSlashCommands,
  CHANNELS,
} from "@/lib/discord";

// POST /api/discord/setup — One-time setup: create channels and register slash commands
// Call this once after adding the bot to your server
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results: Record<string, unknown> = {};

  // 1. Get existing channels
  const existingChannels = await getGuildChannels();
  const existingNames = new Set(existingChannels.map((c) => c.name));

  // 2. Create category if it doesn't exist
  let categoryId: string | undefined;
  const existingCategory = existingChannels.find((c) => c.name === "Starbase" && c.type === 4);
  if (existingCategory) {
    categoryId = existingCategory.id;
    results.category = { status: "exists", id: categoryId };
  } else {
    const category = await createCategory("Starbase");
    if (category) {
      categoryId = category.id;
      results.category = { status: "created", id: categoryId };
    } else {
      results.category = { status: "failed" };
    }
  }

  // 3. Create channels under the category
  const channelNames = Object.values(CHANNELS);
  const createdChannels: Record<string, string> = {};

  for (const name of channelNames) {
    if (existingNames.has(name)) {
      const existing = existingChannels.find((c) => c.name === name);
      if (existing) createdChannels[name] = existing.id;
      results[name] = { status: "exists", id: existing?.id };
    } else {
      const channel = await createChannel(name, categoryId);
      if (channel) {
        createdChannels[name] = channel.id;
        results[name] = { status: "created", id: channel.id };
      } else {
        results[name] = { status: "failed" };
      }
    }
  }

  // 4. Register slash commands
  const commandResult = await registerSlashCommands();
  results.slash_commands = commandResult;

  // 5. Send welcome message to general channel
  if (createdChannels[CHANNELS.GENERAL]) {
    const { sendMessage } = await import("@/lib/discord");
    await sendMessage(
      createdChannels[CHANNELS.GENERAL],
      "**Starbase is online.** \n\nI'm your household assistant. You can:\n- Type naturally in this channel and I'll respond\n- Use `/ask` for quick questions\n- Use `/task`, `/habit`, `/budget`, `/shop`, `/dashboard` for shortcuts\n\nWhat can I help with?"
    );
  }

  return NextResponse.json({ setup: results });
}
