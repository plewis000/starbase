import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";
import {
  getGuildChannels,
  deleteChannel,
  createCategory,
  createChannel,
  registerSlashCommands,
  sendEmbed,
  CHANNELS,
  LEGACY_CHANNELS,
  ZEV_COLOR,
  SYSTEM_COLOR,
} from "@/lib/discord";

/**
 * POST /api/discord/reset — Full Discord reset: delete channels, recreate, register commands, send welcome
 * Auth: PIPELINE_SECRET (so Pollux can call it directly)
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.PIPELINE_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const results: Record<string, unknown> = {};

  // 1. Delete ALL existing Zev channels + category
  const existingChannels = await getGuildChannels();
  const zevCategory = existingChannels.find((c) => c.name.toLowerCase() === "zev" && c.type === 4);
  const allChannelNames = new Set<string>([...Object.values(CHANNELS), ...LEGACY_CHANNELS]);

  // Delete channels under Zev category or matching channel names (including legacy)
  const toDelete = existingChannels.filter(
    (c) => (zevCategory && c.parent_id === zevCategory.id) || allChannelNames.has(c.name)
  );

  const deleted: string[] = [];
  for (const ch of toDelete) {
    const ok = await deleteChannel(ch.id);
    if (ok) deleted.push(ch.name);
  }

  // Delete the category itself
  if (zevCategory) {
    await deleteChannel(zevCategory.id);
    deleted.push("Zev (category)");
  }
  results.deleted = deleted;

  // 2. Create fresh category + channels
  const category = await createCategory("Zev");
  const categoryId = category?.id;
  results.category = category ? { status: "created", id: categoryId } : { status: "failed" };

  const createdChannels: Record<string, string> = {};
  for (const name of Object.values(CHANNELS)) {
    const ch = await createChannel(name, categoryId);
    if (ch) {
      createdChannels[name] = ch.id;
      results[name] = { status: "created", id: ch.id };
    } else {
      results[name] = { status: "failed" };
    }
  }

  // 3. Register slash commands
  const commandResult = await registerSlashCommands();
  results.slash_commands = commandResult;

  // 4. Store channel IDs in env-accessible way (update PIPELINE_CHANNEL_ID reference)
  const generalId = createdChannels[CHANNELS.GENERAL];

  // 5. Send System welcome to #general
  if (generalId) {
    await sendEmbed(generalId, {
      title: "⚙️ SYSTEM INITIALIZED",
      description: [
        "The Keep is online. All systems operational.",
        "",
        "**Your Outreach Associate (Zev) is standing by.**",
        "",
        "To get started, link your Discord account:",
        "```",
        "/link your-email@example.com",
        "```",
        "",
        "Then try these:",
        "• `/help` — see all commands",
        "• `/ask` — talk to Zev (she'll walk you through onboarding)",
        "• `/task` — create a task",
        "• `/habit` — check in to a habit",
        "• `/dashboard` — your daily overview",
        "",
        "*First time? Zev will ask you a few questions to learn your style. Takes about 5 minutes.*",
      ].join("\n"),
      color: SYSTEM_COLOR,
      timestamp: new Date().toISOString(),
      footer: { text: "The Keep | Desperado Crawler Club" },
    });
  }

  // 6. Send a personal nudge for unlinked users
  const { data: users } = await platform(supabase)
    .from("users")
    .select("id, full_name, email");

  const { data: prefs } = await platform(supabase)
    .from("user_preferences")
    .select("user_id, preference_value")
    .eq("preference_key", "discord_user_id");

  const linkedUserIds = new Set((prefs || []).map((p) => p.user_id));
  const unlinkedUsers = (users || []).filter((u) => !linkedUserIds.has(u.id));

  if (generalId && unlinkedUsers.length > 0) {
    const names = unlinkedUsers.map((u) => `**${u.full_name || u.email}**`).join(", ");
    await sendEmbed(generalId, {
      title: "📋 Waiting on you...",
      description: [
        `${names} — you haven't linked your Discord account yet.`,
        "",
        "Type this to get started:",
        "```",
        ...unlinkedUsers.map((u) => `/link ${u.email}`),
        "```",
        "",
        "Once linked, Zev can send you reminders, briefings, and actually be useful.",
      ].join("\n"),
      color: ZEV_COLOR,
      timestamp: new Date().toISOString(),
      footer: { text: "Zev | Onboarding" },
    });
  }

  return NextResponse.json({
    reset: true,
    results,
    general_channel_id: generalId,
    unlinked_users: unlinkedUsers.map((u) => u.full_name || u.email),
  });
}
