// Discord API helpers — used by both interaction webhook and setup route
// Uses @discordjs/rest for automatic rate-limit handling

import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

// Singleton REST client — handles rate limits, retries, and auth automatically
const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id?: string;
}

// Send a message to a Discord channel
export async function sendMessage(channelId: string, content: string) {
  // Discord message limit is 2000 chars — split if needed
  const chunks = splitMessage(content, 2000);
  for (const chunk of chunks) {
    try {
      await rest.post(Routes.channelMessages(channelId), {
        body: { content: chunk },
      });
    } catch (err) {
      console.error("[discord] sendMessage failed:", err);
    }
  }
}

// Send an embed to a Discord channel
export async function sendEmbed(channelId: string, embed: Record<string, unknown>) {
  try {
    await rest.post(Routes.channelMessages(channelId), {
      body: { embeds: [embed] },
    });
  } catch (err) {
    console.error("[discord] sendEmbed failed:", err);
  }
}

// Send a message with buttons (Discord message components)
// Returns the message ID for tracking button interactions
export async function sendMessageWithButtons(
  channelId: string,
  payload: { content?: string; embeds?: Record<string, unknown>[]; components: Record<string, unknown>[] }
): Promise<string | null> {
  try {
    const msg = (await rest.post(Routes.channelMessages(channelId), {
      body: payload,
    })) as { id?: string };
    return msg.id || null;
  } catch (err) {
    console.error("[discord] sendMessageWithButtons failed:", err);
    return null;
  }
}

// Get all channels in the guild
export async function getGuildChannels(): Promise<DiscordChannel[]> {
  try {
    return (await rest.get(Routes.guildChannels(GUILD_ID))) as DiscordChannel[];
  } catch {
    return [];
  }
}

// Create a text channel in the guild
export async function createChannel(name: string, categoryId?: string): Promise<DiscordChannel | null> {
  const body: Record<string, unknown> = {
    name,
    type: 0, // Text channel
  };
  if (categoryId) body.parent_id = categoryId;

  try {
    return (await rest.post(Routes.guildChannels(GUILD_ID), { body })) as DiscordChannel;
  } catch (err) {
    console.error("Failed to create channel:", err);
    return null;
  }
}

// Create a category channel
export async function createCategory(name: string): Promise<DiscordChannel | null> {
  try {
    return (await rest.post(Routes.guildChannels(GUILD_ID), {
      body: { name, type: 4 }, // 4 = category
    })) as DiscordChannel;
  } catch (err) {
    console.error("Failed to create category:", err);
    return null;
  }
}

// Register slash commands for the guild
export async function registerSlashCommands() {
  const APP_ID = process.env.DISCORD_APP_ID!;

  const commands = [
    {
      name: "task",
      description: "Create a new task",
      options: [
        { name: "title", description: "Task title", type: 3, required: true },
        { name: "due", description: "Due date (YYYY-MM-DD)", type: 3, required: false },
        { name: "priority", description: "Priority level", type: 3, required: false, choices: [
          { name: "High", value: "high" },
          { name: "Medium", value: "medium" },
          { name: "Low", value: "low" },
        ]},
      ],
    },
    {
      name: "habit",
      description: "Check in to a habit",
      options: [
        { name: "name", description: "Habit name (search)", type: 3, required: true },
      ],
    },
    {
      name: "budget",
      description: "Get spending summary",
      options: [
        { name: "period", description: "Time period", type: 3, required: false, choices: [
          { name: "This week", value: "week" },
          { name: "This month", value: "month" },
          { name: "This year", value: "year" },
        ]},
      ],
    },
    {
      name: "ask",
      description: "Ask Zev anything",
      options: [
        { name: "message", description: "Your question or request", type: 3, required: true },
      ],
    },
    {
      name: "shop",
      description: "Add items to shopping list",
      options: [
        { name: "items", description: "Items to add (comma-separated)", type: 3, required: true },
      ],
    },
    {
      name: "dashboard",
      description: "Get your daily overview",
    },
    {
      name: "usage",
      description: "Check API usage and costs",
    },
    {
      name: "crawl",
      description: "View your crawler profile and stats",
    },
    {
      name: "feedback",
      description: "Submit a bug, wish, or feedback",
      options: [
        { name: "description", description: "What's the issue or idea?", type: 3, required: true },
        { name: "type", description: "Type of feedback", type: 3, required: false, choices: [
          { name: "Bug", value: "bug" },
          { name: "Wish", value: "wish" },
          { name: "Feedback", value: "feedback" },
          { name: "Question", value: "question" },
        ]},
      ],
    },
    {
      name: "review",
      description: "Get your weekly review from Zev",
    },
    {
      name: "nudge",
      description: "Check what needs attention right now",
    },
    {
      name: "focus",
      description: "Get your prioritized focus list — what to do right now",
    },
    {
      name: "pipeline",
      description: "Show active pipeline jobs",
    },
    {
      name: "link",
      description: "Link your Discord account to the app (required for slash commands)",
      options: [
        { name: "email", description: "The email you signed up with", type: 3, required: true },
      ],
    },
    {
      name: "help",
      description: "List all available slash commands",
    },
  ];

  try {
    await rest.put(
      Routes.applicationGuildCommands(APP_ID, GUILD_ID),
      { body: commands },
    );
    return { success: true, commands: commands.length };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Failed to register commands:", errMsg);
    return { success: false, error: errMsg };
  }
}

// Split long messages at newlines
function splitMessage(content: string, maxLength: number): string[] {
  if (content.length <= maxLength) return [content];

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find last newline before limit
    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt === -1 || splitAt < maxLength / 2) {
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

// Channel name constants
export const CHANNELS = {
  GENERAL: "general",
  BUDGET: "budget",
  TASKS: "tasks",
  GOALS: "goals",
  SHOPPING: "shopping",
  LOGS: "logs",
  PIPELINE: "pipeline",
} as const;

// Bot embed colors — The Keep theme
export const ZEV_COLOR = 0xD4A857;      // Warm gold — Zev's personal color
export const SYSTEM_COLOR = 0xDC2626;   // Crimson red — The System's announcements

// Update a message (e.g., to disable buttons after interaction)
export async function editMessage(channelId: string, messageId: string, payload: Record<string, unknown>) {
  try {
    await rest.patch(Routes.channelMessage(channelId, messageId), {
      body: payload,
    });
  } catch (err) {
    console.error("[discord] editMessage failed:", err);
  }
}

export { DISCORD_API, GUILD_ID };
