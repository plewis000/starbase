// Discord API helpers — used by both interaction webhook and setup route

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;
const GUILD_ID = process.env.DISCORD_GUILD_ID!;

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id?: string;
}

// Standard headers for Discord API calls
function headers() {
  return {
    Authorization: `Bot ${BOT_TOKEN}`,
    "Content-Type": "application/json",
  };
}

// Send a message to a Discord channel
export async function sendMessage(channelId: string, content: string) {
  // Discord message limit is 2000 chars — split if needed
  const chunks = splitMessage(content, 2000);
  for (const chunk of chunks) {
    await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ content: chunk }),
    });
  }
}

// Send an embed to a Discord channel
export async function sendEmbed(channelId: string, embed: Record<string, unknown>) {
  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ embeds: [embed] }),
  });
}

// Send a message with buttons (Discord message components)
// Returns the message ID for tracking button interactions
export async function sendMessageWithButtons(
  channelId: string,
  payload: { content?: string; embeds?: Record<string, unknown>[]; components: Record<string, unknown>[] }
): Promise<string | null> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("[discord] sendMessageWithButtons failed:", await res.text());
    return null;
  }
  const msg = await res.json();
  return msg.id || null;
}

// Get all channels in the guild
export async function getGuildChannels(): Promise<DiscordChannel[]> {
  const res = await fetch(`${DISCORD_API}/guilds/${GUILD_ID}/channels`, {
    headers: headers(),
  });
  if (!res.ok) return [];
  return res.json();
}

// Create a text channel in the guild
export async function createChannel(name: string, categoryId?: string): Promise<DiscordChannel | null> {
  const body: Record<string, unknown> = {
    name,
    type: 0, // Text channel
  };
  if (categoryId) body.parent_id = categoryId;

  const res = await fetch(`${DISCORD_API}/guilds/${GUILD_ID}/channels`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("Failed to create channel:", await res.text());
    return null;
  }
  return res.json();
}

// Create a category channel
export async function createCategory(name: string): Promise<DiscordChannel | null> {
  const res = await fetch(`${DISCORD_API}/guilds/${GUILD_ID}/channels`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name, type: 4 }), // 4 = category
  });

  if (!res.ok) {
    console.error("Failed to create category:", await res.text());
    return null;
  }
  return res.json();
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
      name: "pipeline",
      description: "Show active pipeline jobs",
    },
  ];

  const res = await fetch(`${DISCORD_API}/applications/${APP_ID}/guilds/${GUILD_ID}/commands`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Failed to register commands:", err);
    return { success: false, error: err };
  }

  return { success: true, commands: commands.length };
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

// Bot embed colors — Desperado Club theme
export const ZEV_COLOR = 0xD4A857;      // Warm gold — Zev's personal color
export const SYSTEM_COLOR = 0xDC2626;   // Crimson red — The System's announcements

// Update a message (e.g., to disable buttons after interaction)
export async function editMessage(channelId: string, messageId: string, payload: Record<string, unknown>) {
  await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(payload),
  });
}

export { DISCORD_API, GUILD_ID };
