// ============================================================
// FILE: scripts/onboard-user.ts
// PURPOSE: Send Zev onboarding DMs to a new user via Discord
// USAGE: npx tsx scripts/onboard-user.ts <discord_user_id> <invite_code>
// EXAMPLE: npx tsx scripts/onboard-user.ts 416481625430556672 ABC123
// REQUIRES: DISCORD_BOT_TOKEN in .env.local
// ============================================================

import "dotenv/config";

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DELAY_MS = 90_000; // 90 seconds between messages

if (!BOT_TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN in environment");
  process.exit(1);
}

const [userId, inviteCode] = process.argv.slice(2);

if (!userId || !inviteCode) {
  console.error("Usage: npx tsx scripts/onboard-user.ts <discord_user_id> <invite_code>");
  process.exit(1);
}

const headers = {
  Authorization: `Bot ${BOT_TOKEN}`,
  "Content-Type": "application/json",
};

async function createDMChannel(recipientId: string): Promise<string> {
  const res = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers,
    body: JSON.stringify({ recipient_id: recipientId }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create DM channel: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.id;
}

async function sendMessage(channelId: string, content: string): Promise<void> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to send message: ${res.status} ${err}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const messages = [
  // Message 1 — Introduction
  `Hey! Zev here — I'm the AI assistant for Desperado Club, the household app Parker's been building. I handle tasks, goals, habits, budget tracking... basically keeping life organized so you two can focus on the good stuff.

Parker's got the app ready for you to try out. Here's the link:
**https://starbase-green.vercel.app**

Sign in with your Google account and you'll land on the dashboard.`,

  // Message 2 — Invite Code
  `One thing — after you sign in, you'll need to join the household. Enter this code when prompted:
**\`${inviteCode}\`**
That links your account to Parker's so you see shared tasks and everything stays in sync.`,

  // Message 3 — What To Do
  `Here's all I'd ask: poke around the Tasks section. Create a task, check one off, open one up. If anything feels weird, broken, or you think "this should work differently" — tap the gold **Z** button in the corner, go to the **Feedback** tab, and tell me. Bug, wish, or general thoughts — all useful.

No pressure, no homework. Just use it like any todo app and let us know what sucks.`,

  // Message 4 — Warm Close
  `That's it from me. I'll check in tomorrow to see how it's going. If you need anything, you can talk to me through the app too — same Z button, Chat tab.

Welcome to the club. 🏰`,
];

async function main() {
  console.log(`Creating DM channel with user ${userId}...`);
  const channelId = await createDMChannel(userId);
  console.log(`DM channel created: ${channelId}`);

  for (let i = 0; i < messages.length; i++) {
    if (i > 0) {
      console.log(`Waiting ${DELAY_MS / 1000}s before next message...`);
      await sleep(DELAY_MS);
    }

    console.log(`Sending message ${i + 1}/${messages.length}...`);
    await sendMessage(channelId, messages[i]);
    console.log(`Message ${i + 1} sent.`);
  }

  console.log("Onboarding complete!");
}

main().catch((err) => {
  console.error("Onboarding failed:", err);
  process.exit(1);
});
