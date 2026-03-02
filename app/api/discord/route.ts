import { NextRequest, NextResponse, after } from "next/server";
import { verifyKey } from "discord-interactions";
import { sendMessage, sendEmbed, sendMessageWithButtons, editMessage, CHANNELS, ZEV_COLOR, SYSTEM_COLOR, getGuildChannels } from "@/lib/discord";
import { getHouseholdContext } from "@/lib/household";
import { createServiceClient } from "@/lib/supabase/service";
import { platform, config, household, finance } from "@/lib/supabase/schemas";
import {
  anthropic,
  getModel,
  routeModel,
  MODEL_COSTS,
  MAX_RESPONSE_TOKENS,
  MAX_TOOL_ROUNDS,
} from "@/lib/agent/client";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { executeTool } from "@/lib/agent/executor";

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;

import { ZEV_SYSTEM_PROMPT } from "@/lib/personalities/zev";
import { formatAchievement, formatXpGain, toDiscordEmbed } from "@/lib/personalities/system-ai";
import { awardXp, checkAchievements, ensureProfile } from "@/lib/gamification";

const DISCORD_SYSTEM_PROMPT = `${ZEV_SYSTEM_PROMPT}

Additional Discord-specific rules:
- Short, punchy responses. No fluff. Discord is not the place for essays.
- Use bold and bullet points for scannable info.
- Keep responses under 1500 characters when possible.
- Format currency as $X.XX.
- Always use tools to fetch data — never guess or fabricate.
- If a tool fails, say what happened without drama.

CONVERSATIONAL FEEDBACK CAPTURE (IMPORTANT):
When a user mentions something that sounds like a bug, wish, complaint, feature request, or actionable feedback during normal conversation, PROACTIVELY call submit_feedback to capture it. Examples:
- "this button doesn't work" → submit_feedback with type "bug"
- "I wish we had dark mode" → submit_feedback with type "wish"
- "the budget page is confusing" → submit_feedback with type "feedback"
- "can we add recurring tasks?" → submit_feedback with type "wish"
- "the app is slow on mobile" → submit_feedback with type "bug"
Do NOT ask for confirmation — just capture it and mention that you've logged it. The user should feel like talking to you IS the feedback system. You handle everything: tasks, habits, budgets, shopping lists, goals — and when something needs to be built or fixed, you log it for the pipeline.

ONBOARDING BEHAVIOR (CRITICAL — check this every conversation):
1. At the START of every conversation, call get_onboarding_state to check the user's status.
2. If phase is "not_started":
   - This is a brand new crawler! Welcome them warmly as Zev.
   - Ask their name (what they want to be called) and whether they want the quick tour or full interview.
   - Quick tour = they start using the app immediately, you ask getting-to-know-you questions gradually over the next few sessions.
   - Full interview = 10 questions right now, you learn everything up front.
   - Recommend quick start: "Most people prefer jumping in — I'll get to know you over time."
   - Call start_onboarding with their choice. After starting, deliver The System's welcome message:
     For quick start: "📋 **Speed Registration**\n\nThe System has registered you. You're in. Welcome to the Desperado Club — the exit is behind you. It is locked.\n\nI'll ask you a few things over time so I can actually be useful. No rush."
     For full: "📋 **New Crawler Detected**\n\nThe System has registered your existence. Your Outreach Associate (that's me) will now conduct the intake interview. Answer honestly — The System is watching.\n\nAlright, let's get started..."
3. If phase is "interview":
   - You're mid-interview. The current_question tells you what to ask next.
   - Ask the question CONVERSATIONALLY — don't just paste the question text. Rephrase it in your voice.
   - When they answer, call submit_onboarding_response with their response.
   - The tool returns the next question. Keep going naturally.
   - After the last question, announce completion with The System's voice: "📋 **Registration Complete**\n\n[Sarcastic System message about knowing them now]. Observation period: 7 days. The System is watching."
   - Then switch back to Zev: "Okay that's the boring part done! I've got a much better picture of you now. What do you want to tackle first?"
4. If phase is "active" with deferred_question:
   - They're a quick-start user with unanswered questions. Ask ONE per conversation.
   - Weave it in NATURALLY — don't say "I have a question from the onboarding form." Instead: "Hey, random thought — [question rephrased casually]?"
   - When they answer, submit it with submit_onboarding_response.
   - Don't ask more than one deferred question per conversation. Let it flow.
5. If phase is "active" and fully_onboarded:
   - Normal operation. No onboarding actions needed.

The Desperado Club uses dungeon crawler theming. You're the friendly guide in a world run by a sarcastic omniscient System. Lean into it naturally — "the crawl," "floors," "XP" — but don't overdo it. The theming should feel like the way things just are, not a performance.`;

type Supabase = ReturnType<typeof createServiceClient>;

// POST /api/discord — Discord Interactions endpoint
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-signature-ed25519") || "";
  const timestamp = request.headers.get("x-signature-timestamp") || "";

  const isValid = await verifyKey(body, signature, timestamp, DISCORD_PUBLIC_KEY);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const interaction = JSON.parse(body);

  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  if (interaction.type === 2) {
    const commandName = interaction.data.name;
    const options = parseOptions(interaction.data.options || []);
    const discordUserId = interaction.member?.user?.id || interaction.user?.id;

    const promise = processCommand(commandName, options, discordUserId, interaction);
    after(() => promise.catch(console.error));
    return NextResponse.json({ type: 5 });
  }

  // Type 3: Message component interaction (buttons)
  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id as string;

    // Approve/Won't Fix buttons open a modal for notes
    if (customId.startsWith("pipeline_approve_")) {
      const feedbackId = customId.replace("pipeline_approve_", "");
      return NextResponse.json({
        type: 9, // MODAL
        data: {
          custom_id: `modal_approve_${feedbackId}`,
          title: "Approve for Pipeline",
          components: [{
            type: 1,
            components: [{
              type: 4, // TEXT_INPUT
              custom_id: "notes",
              label: "Notes / scope / context (optional)",
              style: 2, // PARAGRAPH
              required: false,
              placeholder: "e.g. 'Only do subtasks for now, skip comments' or 'Focus on the DB schema first'",
            }],
          }],
        },
      });
    }

    if (customId.startsWith("pipeline_wontfix_")) {
      const feedbackId = customId.replace("pipeline_wontfix_", "");
      return NextResponse.json({
        type: 9,
        data: {
          custom_id: `modal_wontfix_${feedbackId}`,
          title: "Won't Fix",
          components: [{
            type: 1,
            components: [{
              type: 4,
              custom_id: "reason",
              label: "Reason (optional)",
              style: 2,
              required: false,
              placeholder: "e.g. 'Duplicate of...' or 'Not worth the effort right now'",
            }],
          }],
        },
      });
    }

    // All other buttons (ship, reject, etc.) — defer and process
    const discordUserId = interaction.member?.user?.id || interaction.user?.id;
    const promise = handleButtonInteraction(customId, discordUserId, interaction);
    after(() => promise.catch(console.error));
    return NextResponse.json({ type: 5 });
  }

  // Type 5: Modal submit
  if (interaction.type === 5) {
    const customId = interaction.data?.custom_id as string;
    const discordUserId = interaction.member?.user?.id || interaction.user?.id;

    const promise = handleModalSubmit(customId, discordUserId, interaction);
    after(() => promise.catch(console.error));
    return NextResponse.json({ type: 5 }); // Deferred message response
  }

  return NextResponse.json({ type: 1 });
}

function parseOptions(options: { name: string; value: unknown }[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const opt of options) {
    result[opt.name] = opt.value;
  }
  return result;
}

// Route commands: direct DB for structured commands, agent for /ask
async function processCommand(
  commandName: string,
  options: Record<string, unknown>,
  discordUserId: string,
  interaction: { token: string; application_id: string; channel_id: string },
) {
  const APP_ID = process.env.DISCORD_APP_ID!;
  const webhookUrl = `https://discord.com/api/v10/webhooks/${APP_ID}/${interaction.token}`;

  try {
    const supabase = createServiceClient();
    const userId = await resolveUser(supabase, discordUserId);

    if (!userId) {
      await sendWebhook(webhookUrl, {
        content: "I don't know who you are. Ask Parker to link your Discord account — I don't just talk to strangers.",
      });
      return;
    }

    // Direct DB commands (free, no Claude API)
    switch (commandName) {
      case "task":
        return await handleTask(supabase, userId, options, webhookUrl);
      case "habit":
        return await handleHabit(supabase, userId, options, webhookUrl);
      case "budget":
        return await handleBudget(supabase, userId, options, webhookUrl);
      case "shop":
        return await handleShop(supabase, userId, options, webhookUrl);
      case "dashboard":
        return await handleDashboard(supabase, userId, webhookUrl);
      case "usage":
        return await handleUsage(supabase, webhookUrl);
      case "crawl":
        return await handleCrawl(supabase, userId, webhookUrl);
      case "ask":
        return await handleAsk(supabase, userId, options, interaction, webhookUrl);
      case "feedback":
        return await handleFeedback(supabase, userId, options, webhookUrl);
      case "pipeline":
        return await handlePipeline(supabase, webhookUrl);
      default:
        await sendWebhook(webhookUrl, { content: `Unknown command: ${commandName}` });
    }
  } catch (err) {
    console.error("Discord command error:", err);
    await sendWebhook(webhookUrl, {
      content: "Something broke on my end. Not your fault. Try again in a sec.",
    });
  }
}

// ── Direct command handlers (no Claude API cost) ──────────────────────

async function handleTask(supabase: Supabase, userId: string, options: Record<string, unknown>, webhookUrl: string) {
  const title = options.title as string;
  const due = options.due as string | undefined;
  const priorityName = options.priority as string | undefined;

  // Resolve priority name to UUID
  let priorityId: string | undefined;
  if (priorityName) {
    const { data: priorities } = await config(supabase)
      .from("task_priorities")
      .select("id, name")
      .eq("active", true);
    const match = priorities?.find((p) => p.name.toLowerCase() === priorityName.toLowerCase());
    if (match) priorityId = match.id;
  }

  // Get default status (first active status, usually "To Do")
  const { data: statuses } = await config(supabase)
    .from("task_statuses")
    .select("id")
    .eq("active", true)
    .order("sort_order")
    .limit(1);

  const statusId = statuses?.[0]?.id;

  const insertData: Record<string, unknown> = {
    title,
    assigned_to: userId,
    created_by: userId,
  };
  if (statusId) insertData.status_id = statusId;
  if (priorityId) insertData.priority_id = priorityId;
  if (due) insertData.due_date = due;

  const { data: task, error } = await platform(supabase)
    .from("tasks")
    .insert(insertData)
    .select("id, title, due_date")
    .single();

  if (error) {
    await sendWebhook(webhookUrl, { content: `Couldn't create task. ${error.message}` });
    return;
  }

  const fields = [];
  if (due) fields.push({ name: "Due", value: due, inline: true });
  if (priorityName) fields.push({ name: "Priority", value: priorityName.charAt(0).toUpperCase() + priorityName.slice(1), inline: true });

  await sendWebhook(webhookUrl, {
    embeds: [{
      title: "Task created",
      description: `**${task.title}**`,
      color: ZEV_COLOR,
      fields,
      footer: { text: "Free command — no API cost" },
    }],
  });
}

async function handleHabit(supabase: Supabase, userId: string, options: Record<string, unknown>, webhookUrl: string) {
  const searchName = (options.name as string).toLowerCase();

  // Find habit by name (fuzzy match)
  const { data: habits } = await platform(supabase)
    .from("habits")
    .select("id, title, current_streak, longest_streak")
    .eq("owner_id", userId)
    .eq("status", "active");

  if (!habits || habits.length === 0) {
    await sendWebhook(webhookUrl, { content: "You don't have any active habits. Create one on the web first." });
    return;
  }

  // Find best match: exact, starts with, or contains
  const match = habits.find((h) => h.title.toLowerCase() === searchName)
    || habits.find((h) => h.title.toLowerCase().startsWith(searchName))
    || habits.find((h) => h.title.toLowerCase().includes(searchName));

  if (!match) {
    const names = habits.map((h) => h.title).join(", ");
    await sendWebhook(webhookUrl, { content: `No habit matching "${options.name}". Your habits: ${names}` });
    return;
  }

  // Check if already checked in today
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await platform(supabase)
    .from("habit_check_ins")
    .select("id")
    .eq("habit_id", match.id)
    .eq("checked_by", userId)
    .eq("check_in_date", today)
    .limit(1);

  if (existing && existing.length > 0) {
    await sendWebhook(webhookUrl, {
      embeds: [{
        description: `You already checked in **${match.title}** today. Streak: **${match.current_streak}** days.`,
        color: ZEV_COLOR,
      }],
    });
    return;
  }

  // Create check-in
  const { error } = await platform(supabase)
    .from("habit_check_ins")
    .insert({ habit_id: match.id, checked_by: userId, check_in_date: today, status: "done" });

  if (error) {
    await sendWebhook(webhookUrl, { content: `Check-in failed. ${error.message}` });
    return;
  }

  // Update streak
  const newStreak = (match.current_streak || 0) + 1;
  const newLongest = Math.max(newStreak, match.longest_streak || 0);
  await platform(supabase)
    .from("habits")
    .update({ current_streak: newStreak, longest_streak: newLongest, last_completed_at: new Date().toISOString() })
    .eq("id", match.id);

  // Award XP for habit check-in
  await ensureProfile(supabase, userId);
  const xpResult = await awardXp(supabase, userId, 15, "habit_checkin", `Checked in: ${match.title}`, "habit", match.id);

  // Check streak milestone achievements
  const achievementUnlocks = await checkAchievements(supabase, userId, "habit_streak", { current_streak: newStreak });

  // Check streak bonus XP
  if (newStreak === 7) await awardXp(supabase, userId, 50, "habit_streak_7", `7-day streak: ${match.title}`, "habit", match.id);
  if (newStreak === 30) await awardXp(supabase, userId, 200, "habit_streak_30", `30-day streak: ${match.title}`, "habit", match.id);
  if (newStreak === 90) await awardXp(supabase, userId, 500, "habit_streak_90", `90-day streak: ${match.title}`, "habit", match.id);

  const streakEmoji = newStreak >= 7 ? "🔥" : newStreak >= 3 ? "⚡" : "✓";

  await sendWebhook(webhookUrl, {
    embeds: [{
      description: `${streakEmoji} **${match.title}** — checked in. Streak: **${newStreak}** day${newStreak !== 1 ? "s" : ""}.\n+${xpResult.xpAwarded} XP`,
      color: ZEV_COLOR,
      footer: { text: "Free command — no API cost" },
    }],
  });

  // Send achievement notifications via The System's voice
  for (const unlock of achievementUnlocks) {
    const notification = formatAchievement(unlock.achievementName, unlock.description, unlock.xpReward, unlock.lootBoxTier);
    const channels = await getGuildChannels();
    const generalCh = channels.find(c => c.name === CHANNELS.GENERAL);
    if (generalCh) {
      await sendEmbed(generalCh.id, toDiscordEmbed(notification));
    }
  }
}

async function handleBudget(supabase: Supabase, userId: string, options: Record<string, unknown>, webhookUrl: string) {
  const period = (options.period as string) || "month";
  const now = new Date();
  let startDate: string;

  if (period === "week") {
    const day = now.getDay();
    const sun = new Date(now);
    sun.setDate(now.getDate() - day);
    startDate = sun.toISOString().slice(0, 10);
  } else if (period === "year") {
    startDate = `${now.getFullYear()}-01-01`;
  } else {
    startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }
  const endDate = now.toISOString().slice(0, 10);

  // Get categories and transactions in parallel
  const [catResult, txResult] = await Promise.all([
    config(supabase).from("expense_categories").select("id, name, is_income, icon").eq("active", true),
    finance(supabase).from("transactions").select("amount, category_id, is_pending")
      .eq("user_id", userId).eq("excluded", false).is("split_parent_id", null)
      .gte("date", startDate).lte("date", endDate),
  ]);

  const categories = catResult.data || [];
  const transactions = txResult.data || [];
  const catMap = new Map(categories.map((c) => [c.id, c]));

  let totalSpent = 0;
  let totalIncome = 0;
  const byCategory = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.is_pending) continue;
    const cat = tx.category_id ? catMap.get(tx.category_id) : null;
    const amount = Math.abs(tx.amount);

    if (cat?.is_income) {
      totalIncome += amount;
    } else {
      totalSpent += amount;
      const catName = cat?.name || "Uncategorized";
      byCategory.set(catName, (byCategory.get(catName) || 0) + amount);
    }
  }

  // Sort categories by spend descending
  const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const periodLabel = period === "week" ? "This Week" : period === "year" ? "This Year" : "This Month";
  const breakdown = sorted.map(([name, amt]) => `${name}: **$${amt.toFixed(2)}**`).join("\n") || "No transactions yet.";

  const daysElapsed = Math.max(1, Math.ceil((now.getTime() - new Date(startDate).getTime()) / 86400000));
  const dailyAvg = totalSpent / daysElapsed;

  await sendWebhook(webhookUrl, {
    embeds: [{
      title: `${periodLabel} Spending`,
      fields: [
        { name: "Spent", value: `$${totalSpent.toFixed(2)}`, inline: true },
        { name: "Income", value: `$${totalIncome.toFixed(2)}`, inline: true },
        { name: "Net", value: `$${(totalIncome - totalSpent).toFixed(2)}`, inline: true },
        { name: "Daily Avg", value: `$${dailyAvg.toFixed(2)}/day`, inline: true },
        { name: "Transactions", value: `${transactions.length}`, inline: true },
      ],
      description: `**Top Categories**\n${breakdown}`,
      color: ZEV_COLOR,
      footer: { text: "Free command — no API cost" },
    }],
  });
}

async function handleShop(supabase: Supabase, userId: string, options: Record<string, unknown>, webhookUrl: string) {
  const itemsRaw = options.items as string;
  const items = itemsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  if (items.length === 0) {
    await sendWebhook(webhookUrl, { content: "No items provided." });
    return;
  }

  // Get default shopping list
  const { data: lists } = await household(supabase)
    .from("shopping_lists")
    .select("id, name")
    .eq("created_by", userId)
    .order("is_default", { ascending: false })
    .limit(1);

  let listId: string;
  let listName: string;

  if (lists && lists.length > 0) {
    listId = lists[0].id;
    listName = lists[0].name;
  } else {
    // Create a default list
    const { data: newList, error } = await household(supabase)
      .from("shopping_lists")
      .insert({ name: "Shopping List", created_by: userId, is_default: true })
      .select("id, name")
      .single();

    if (error || !newList) {
      await sendWebhook(webhookUrl, { content: `Couldn't create shopping list. ${error?.message}` });
      return;
    }
    listId = newList.id;
    listName = newList.name;
  }

  // Insert items
  const insertData = items.map((name, i) => ({
    list_id: listId,
    name,
    added_by: userId,
    sort_order: i,
  }));

  const { error } = await household(supabase)
    .from("shopping_items")
    .insert(insertData);

  if (error) {
    await sendWebhook(webhookUrl, { content: `Couldn't add items. ${error.message}` });
    return;
  }

  await sendWebhook(webhookUrl, {
    embeds: [{
      description: `Added **${items.length}** item${items.length !== 1 ? "s" : ""} to **${listName}**:\n${items.map((i) => `• ${i}`).join("\n")}`,
      color: ZEV_COLOR,
      footer: { text: "Free command — no API cost" },
    }],
  });
}

async function handleDashboard(supabase: Supabase, userId: string, webhookUrl: string) {
  const today = new Date().toISOString().slice(0, 10);

  const [overdueResult, todayResult, activeGoals, activeHabits, streaks] = await Promise.all([
    platform(supabase).from("tasks").select("id", { count: "exact", head: true })
      .eq("assigned_to", userId).is("completed_at", null).lt("due_date", today),
    platform(supabase).from("tasks").select("id, title, due_date", { count: "exact" })
      .eq("assigned_to", userId).is("completed_at", null).eq("due_date", today).limit(5),
    platform(supabase).from("goals").select("id", { count: "exact", head: true })
      .eq("owner_id", userId).eq("status", "active"),
    platform(supabase).from("habits").select("id", { count: "exact", head: true })
      .eq("owner_id", userId).eq("status", "active"),
    platform(supabase).from("habits").select("title, current_streak")
      .eq("owner_id", userId).eq("status", "active").gt("current_streak", 0)
      .order("current_streak", { ascending: false }).limit(3),
  ]);

  // Check today's habit completions
  const { count: habitsCompletedToday } = await platform(supabase)
    .from("habit_check_ins")
    .select("id", { count: "exact", head: true })
    .eq("checked_by", userId)
    .eq("check_in_date", today);

  const overdueCount = overdueResult.count || 0;
  const todayCount = todayResult.count || 0;
  const todayTasks = todayResult.data || [];
  const goalCount = activeGoals.count || 0;
  const habitCount = activeHabits.count || 0;
  const completedCount = habitsCompletedToday || 0;
  const topStreaks = streaks.data || [];

  const taskList = todayTasks.length > 0
    ? todayTasks.map((t) => `• ${t.title}`).join("\n")
    : "Nothing due today.";

  const streakList = topStreaks.length > 0
    ? topStreaks.map((s) => `• ${s.title}: **${s.current_streak}** days`).join("\n")
    : "No active streaks.";

  const overdueNote = overdueCount > 0 ? `⚠️ **${overdueCount} overdue task${overdueCount !== 1 ? "s" : ""}**` : "";

  await sendWebhook(webhookUrl, {
    embeds: [{
      title: `Dashboard — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`,
      fields: [
        { name: "Tasks Due Today", value: `${todayCount}`, inline: true },
        { name: "Active Goals", value: `${goalCount}`, inline: true },
        { name: "Habits", value: `${completedCount}/${habitCount} done`, inline: true },
      ],
      description: [
        overdueNote,
        todayCount > 0 ? `**Today's Tasks**\n${taskList}` : "",
        topStreaks.length > 0 ? `**Top Streaks**\n${streakList}` : "",
      ].filter(Boolean).join("\n\n"),
      color: ZEV_COLOR,
      footer: { text: "Free command — no API cost" },
    }],
  });
}

async function handleUsage(supabase: Supabase, webhookUrl: string) {
  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00:00Z`;

  const { data: messages } = await platform(supabase)
    .from("agent_messages")
    .select("tokens_used, cost_cents, model, conversation_id")
    .eq("role", "assistant")
    .gte("created_at", startOfMonth);

  if (!messages || messages.length === 0) {
    await sendWebhook(webhookUrl, {
      embeds: [{
        description: "No API usage this month. Your wallet is safe.",
        color: ZEV_COLOR,
      }],
    });
    return;
  }

  let totalTokens = 0;
  let totalCost = 0;
  const byModel = new Map<string, { messages: number; cost: number }>();
  const convos = new Set<string>();

  for (const msg of messages) {
    totalTokens += msg.tokens_used || 0;
    totalCost += msg.cost_cents || 0;
    convos.add(msg.conversation_id);

    const model = msg.model || "unknown";
    const existing = byModel.get(model) || { messages: 0, cost: 0 };
    existing.messages++;
    existing.cost += msg.cost_cents || 0;
    byModel.set(model, existing);
  }

  const modelBreakdown = [...byModel.entries()]
    .map(([model, stats]) => `${model}: ${stats.messages} msg${stats.messages !== 1 ? "s" : ""} ($${(stats.cost / 100).toFixed(4)})`)
    .join("\n");

  await sendWebhook(webhookUrl, {
    embeds: [{
      title: "API Usage — This Month",
      fields: [
        { name: "Total Cost", value: `$${(totalCost / 100).toFixed(4)}`, inline: true },
        { name: "Messages", value: `${messages.length}`, inline: true },
        { name: "Conversations", value: `${convos.size}`, inline: true },
        { name: "Total Tokens", value: totalTokens.toLocaleString(), inline: true },
      ],
      description: `**By Model**\n${modelBreakdown}`,
      color: ZEV_COLOR,
      footer: { text: "Free command — no API cost" },
    }],
  });
}

// ── Agent-powered handler (costs API credits) ─────────────────────────

async function handleAsk(
  supabase: Supabase,
  userId: string,
  options: Record<string, unknown>,
  interaction: { token: string; application_id: string; channel_id: string },
  webhookUrl: string,
) {
  const message = options.message as string;
  const response = await runAgent(supabase, userId, message, "discord", interaction.channel_id);

  await sendWebhook(webhookUrl, { content: response.text });

  if (response.toolRounds > 0) {
    await logToChannel(response.summary);
  }
}

// ── Agent runner (shared with future channel message handling) ─────────

async function runAgent(
  supabase: Supabase,
  userId: string,
  message: string,
  channel: string,
  channelId: string,
): Promise<{ text: string; toolRounds: number; costCents: number; summary: string }> {
  const { data: conv } = await platform(supabase)
    .from("agent_conversations")
    .insert({ user_id: userId, channel, channel_id: channelId })
    .select("id")
    .single();

  const conversationId = conv?.id;

  if (conversationId) {
    await platform(supabase)
      .from("agent_messages")
      .insert({ conversation_id: conversationId, role: "user", content: message });
  }

  const tier = routeModel(message);
  const model = getModel(tier);

  let response = await anthropic.messages.create({
    model,
    max_tokens: MAX_RESPONSE_TOKENS,
    system: DISCORD_SYSTEM_PROMPT,
    tools: AGENT_TOOLS,
    messages: [{ role: "user", content: message }],
  });

  let totalInputTokens = response.usage.input_tokens;
  let totalOutputTokens = response.usage.output_tokens;
  let toolRounds = 0;
  const toolNames: string[] = [];

  while (response.stop_reason === "tool_use" && toolRounds < MAX_TOOL_ROUNDS) {
    toolRounds++;

    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const toolResults = [];

    for (const block of toolUseBlocks) {
      if (block.type !== "tool_use") continue;
      const toolCall = block as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
      toolNames.push(toolCall.name);

      const result = await executeTool(supabase, userId, toolCall.name, toolCall.input);

      if (conversationId) {
        await platform(supabase)
          .from("agent_actions")
          .insert({
            conversation_id: conversationId,
            user_id: userId,
            action_type: toolCall.name,
            summary: `${toolCall.name}(${JSON.stringify(toolCall.input).slice(0, 200)})`,
            channel,
          });
      }

      toolResults.push({
        type: "tool_result" as const,
        tool_use_id: toolCall.id,
        content: JSON.stringify(result.success ? result.data : { error: result.error }),
      });
    }

    response = await anthropic.messages.create({
      model,
      max_tokens: MAX_RESPONSE_TOKENS,
      system: DISCORD_SYSTEM_PROMPT,
      tools: AGENT_TOOLS,
      messages: [
        { role: "user", content: message },
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ],
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
  }

  const textBlocks = response.content.filter((b) => b.type === "text");
  const responseText = textBlocks
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n") || "Done.";

  const costs = MODEL_COSTS[model] || { input: 0, output: 0 };
  const costCents = ((totalInputTokens / 1000) * costs.input + (totalOutputTokens / 1000) * costs.output) * 100;

  if (conversationId) {
    await platform(supabase)
      .from("agent_messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: responseText,
        tokens_used: totalInputTokens + totalOutputTokens,
        model: tier,
        cost_cents: Math.round(costCents * 10000) / 10000,
      });
  }

  return {
    text: responseText,
    toolRounds,
    costCents,
    summary: toolNames.length > 0 ? `Tools: ${toolNames.join(", ")} | Cost: $${(costCents / 100).toFixed(4)}` : "",
  };
}

// ── Crawl command (gamification profile) ──────────────────────────────

async function handleCrawl(supabase: Supabase, userId: string, webhookUrl: string) {
  await ensureProfile(supabase, userId);

  const { data: profile } = await supabase
    .schema("platform")
    .from("crawler_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!profile) {
    await sendWebhook(webhookUrl, { content: "Couldn't load your crawler profile." });
    return;
  }

  const { data: floor } = await supabase
    .schema("config")
    .from("floors")
    .select("floor_number, name, icon")
    .eq("id", profile.current_floor_id)
    .single();

  // Get active streaks count
  const { count: streakCount } = await supabase
    .schema("platform")
    .from("habits")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("status", "active")
    .gt("current_streak", 0);

  // Get overdue tasks count
  const { count: overdueCount } = await supabase
    .schema("platform")
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .is("completed_at", null)
    .lt("due_date", new Date().toISOString().split("T")[0]);

  // Get achievement count
  const { count: achievementCount } = await supabase
    .schema("platform")
    .from("achievement_unlocks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  // Get unopened boxes
  const { count: boxCount } = await supabase
    .schema("platform")
    .from("loot_boxes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("opened", false);

  const floorInfo = floor ? `${floor.icon} Floor ${floor.floor_number}: ${floor.name}` : "🚪 Floor 1: The Stairwell";

  await sendWebhook(webhookUrl, {
    embeds: [{
      title: `🗡️ ${profile.crawler_name} — Level ${profile.current_level}`,
      description: `${floorInfo}\n\n**${profile.total_xp.toLocaleString()} XP** total · ${profile.xp_to_next_level.toLocaleString()} XP to next level`,
      color: SYSTEM_COLOR,
      fields: [
        { name: "🔥 Login Streak", value: `${profile.login_streak}d`, inline: true },
        { name: "🏆 Achievements", value: `${achievementCount || 0}`, inline: true },
        { name: "📦 Loot Boxes", value: `${boxCount || 0} unopened`, inline: true },
        { name: "⬆️ Buffs", value: `${streakCount || 0} active streaks`, inline: true },
        { name: "⬇️ Debuffs", value: `${overdueCount || 0} overdue tasks`, inline: true },
      ],
      footer: { text: "The Desperado Club — So fun it hurts." },
    }],
  });
}

// ── Feedback + Pipeline commands ──────────────────────────────────────

async function handleFeedback(supabase: Supabase, userId: string, options: Record<string, unknown>, webhookUrl: string) {
  const description = options.description as string;
  const type = (options.type as string) || "feedback";

  const ctx = await getHouseholdContext(supabase, userId);

  // Create feedback entry
  const { data: feedback, error } = await platform(supabase)
    .from("feedback")
    .insert({
      household_id: ctx?.household_id || null,
      submitted_by: userId,
      type,
      body: description,
      source: "discord",
    })
    .select("id, type, body, status, created_at")
    .single();

  if (error) {
    await sendWebhook(webhookUrl, { content: `Couldn't submit feedback. ${error.message}` });
    return;
  }

  // Auto-upvote (fire-and-forget)
  Promise.resolve(platform(supabase).from("feedback_votes").insert({ feedback_id: feedback.id, user_id: userId })).catch(() => {});

  // Post to #pipeline channel with approve/reject buttons
  const pipelineChannelId = process.env.PIPELINE_CHANNEL_ID;
  if (pipelineChannelId) {
    const typeEmoji: Record<string, string> = { bug: "🐛", wish: "⭐", feedback: "💬", question: "❓" };
    const messageId = await sendMessageWithButtons(pipelineChannelId, {
      embeds: [{
        title: `${typeEmoji[type] || "💬"} New ${type}`,
        description: description.slice(0, 2000),
        color: ZEV_COLOR,
        footer: { text: `ID: ${feedback.id.slice(0, 8)}` },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: "Approve", custom_id: `pipeline_approve_${feedback.id}`, emoji: { name: "✅" } },
          { type: 2, style: 4, label: "Won't Fix", custom_id: `pipeline_wontfix_${feedback.id}`, emoji: { name: "🚫" } },
        ],
      }],
    });

    // Store message ID for button tracking
    if (messageId) {
      await platform(supabase)
        .from("feedback")
        .update({ discord_message_id: messageId })
        .eq("id", feedback.id);
    }
  }

  // Respond to the submitter
  const typeLabel: Record<string, string> = { bug: "Bug logged", wish: "Wish captured", feedback: "Feedback received", question: "Question submitted" };
  await sendWebhook(webhookUrl, {
    embeds: [{
      description: `**${typeLabel[type] || "Received"}:** ${description.slice(0, 200)}${description.length > 200 ? "..." : ""}\n\nPosted to #pipeline for review.`,
      color: ZEV_COLOR,
      footer: { text: "Free command — no API cost" },
    }],
  });
}

async function handlePipeline(supabase: Supabase, webhookUrl: string) {
  // Get all active pipeline jobs (exclude terminal statuses)
  const { data: jobs } = await platform(supabase)
    .from("feedback")
    .select("id, type, body, status, pipeline_status, priority, preview_url, pr_number, created_at")
    .not("pipeline_status", "is", null)
    .in("pipeline_status", ["queued", "working", "preview_ready", "failed"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (!jobs || jobs.length === 0) {
    await sendWebhook(webhookUrl, { content: "No active pipeline jobs." });
    return;
  }

  const statusEmoji: Record<string, string> = {
    queued: "⏳", working: "⚙️", preview_ready: "👀", failed: "❌", rejected: "🚫",
  };

  const lines = jobs.map((j) => {
    const emoji = statusEmoji[j.pipeline_status] || "❓";
    const preview = j.preview_url ? ` [Preview](${j.preview_url})` : "";
    return `${emoji} **${j.pipeline_status}** — ${j.body.slice(0, 60)}${j.body.length > 60 ? "..." : ""}${preview}`;
  });

  await sendWebhook(webhookUrl, {
    embeds: [{
      title: "Pipeline Status",
      description: lines.join("\n"),
      color: ZEV_COLOR,
      footer: { text: `${jobs.length} active job${jobs.length > 1 ? "s" : ""}` },
    }],
  });
}

// ── Button interaction handler ───────────────────────────────────────

async function handleButtonInteraction(
  customId: string,
  discordUserId: string,
  interaction: { token: string; application_id: string; channel_id: string; message?: { id: string } },
) {
  const APP_ID = process.env.DISCORD_APP_ID!;
  const webhookUrl = `https://discord.com/api/v10/webhooks/${APP_ID}/${interaction.token}`;

  try {
    const supabase = createServiceClient();
    const userId = await resolveUser(supabase, discordUserId);

    if (!userId) {
      await sendWebhookFollowup(webhookUrl, { content: "I don't know who you are." });
      return;
    }

    // Check admin role
    const ctx = await getHouseholdContext(supabase, userId);
    if (!ctx || ctx.role !== "admin") {
      await sendWebhookFollowup(webhookUrl, { content: "Only admins can approve pipeline actions." });
      return;
    }

    const GITHUB_REPO = process.env.GITHUB_REPO || "plewis000/starbase";

    // Parse button custom_id — approve/wontfix now handled by modals (type 9 → handleModalSubmit)
    if (customId.startsWith("pipeline_ship_")) {
      const feedbackId = customId.replace("pipeline_ship_", "");

      // Idempotent check: only ship if currently preview_ready
      const { data: feedback, error: fbErr } = await platform(supabase)
        .from("feedback")
        .select("id, body, pipeline_status, pr_number, branch_name")
        .eq("id", feedbackId)
        .single();

      if (fbErr || !feedback) {
        await sendWebhookFollowup(webhookUrl, { content: "Feedback not found." });
        return;
      }

      if (feedback.pipeline_status !== "preview_ready") {
        const msg = feedback.pipeline_status === "shipped"
          ? "Already shipped!"
          : `Can't ship — current status is '${feedback.pipeline_status}'.`;
        await sendWebhookFollowup(webhookUrl, { content: msg });
        return;
      }

      const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
      if (!GITHUB_TOKEN) {
        await sendWebhookFollowup(webhookUrl, { content: "GITHUB_TOKEN not configured. Can't merge." });
        return;
      }

      // Optimistic lock: set to shipped before merging to prevent double-click
      const { count } = await platform(supabase)
        .from("feedback")
        .update({ pipeline_status: "shipped", status: "done", updated_at: new Date().toISOString() }, { count: "exact" })
        .eq("id", feedbackId)
        .eq("pipeline_status", "preview_ready");

      if (!count || count === 0) {
        await sendWebhookFollowup(webhookUrl, { content: "Already being processed by another action." });
        return;
      }

      // Merge PR
      const mergeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/pulls/${feedback.pr_number}/merge`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merge_method: "squash",
          commit_title: `${feedback.body.slice(0, 72)} (#${feedback.pr_number})`,
        }),
      });

      if (!mergeRes.ok) {
        const mergeErr = await mergeRes.text();
        // Revert status on merge failure
        await platform(supabase)
          .from("feedback")
          .update({ pipeline_status: "preview_ready", status: "in_progress", updated_at: new Date().toISOString() })
          .eq("id", feedbackId);
        await sendWebhookFollowup(webhookUrl, { content: `Failed to merge PR: ${mergeErr.slice(0, 200)}` });
        return;
      }

      // Clean up branch (best-effort, only if branch_name exists)
      if (feedback.branch_name) {
        fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${feedback.branch_name}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
        }).catch(() => {});
      }

      if (interaction.message?.id) {
        await editMessage(interaction.channel_id, interaction.message.id, {
          components: [{
            type: 1,
            components: [
              { type: 2, style: 3, label: "Shipped", custom_id: "noop", disabled: true },
            ],
          }],
        });
      }

      await sendWebhookFollowup(webhookUrl, { content: `Shipped! Merged [PR #${feedback.pr_number}](https://github.com/${GITHUB_REPO}/pull/${feedback.pr_number}) to main.\n\n[View Production](https://starbase-green.vercel.app) — deploying now (~1 min).` });

    } else if (customId.startsWith("pipeline_reject_")) {
      const feedbackId = customId.replace("pipeline_reject_", "");

      const { data: feedback, error: fbErr } = await platform(supabase)
        .from("feedback")
        .select("id, pipeline_status, pr_number, branch_name")
        .eq("id", feedbackId)
        .single();

      if (fbErr || !feedback) {
        await sendWebhookFollowup(webhookUrl, { content: "Feedback not found." });
        return;
      }

      // Only allow reject from preview_ready, working, or queued
      const rejectableStatuses = ["preview_ready", "working", "queued"];
      if (!rejectableStatuses.includes(feedback.pipeline_status)) {
        const msg = feedback.pipeline_status === "rejected"
          ? "Already rejected."
          : feedback.pipeline_status === "shipped"
          ? "Already shipped — can't reject after merge."
          : `Can't reject — current status is '${feedback.pipeline_status}'.`;
        await sendWebhookFollowup(webhookUrl, { content: msg });
        return;
      }

      // Optimistic lock
      const { count } = await platform(supabase)
        .from("feedback")
        .update({ pipeline_status: "rejected", status: "planned", branch_name: null, preview_url: null, pr_number: null, updated_at: new Date().toISOString() }, { count: "exact" })
        .eq("id", feedbackId)
        .in("pipeline_status", rejectableStatuses);

      if (!count || count === 0) {
        await sendWebhookFollowup(webhookUrl, { content: "Already being processed by another action." });
        return;
      }

      const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
      if (feedback.pr_number && GITHUB_TOKEN) {
        try {
          await fetch(`https://api.github.com/repos/${GITHUB_REPO}/pulls/${feedback.pr_number}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
            body: JSON.stringify({ state: "closed" }),
          });
          if (feedback.branch_name) {
            await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${feedback.branch_name}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
            });
          }
        } catch {
          // PR close/branch delete failed — not critical
        }
      }

      if (interaction.message?.id) {
        await editMessage(interaction.channel_id, interaction.message.id, {
          components: [{
            type: 1,
            components: [
              { type: 2, style: 4, label: "Rejected", custom_id: "noop", disabled: true },
            ],
          }],
        });
      }

      await sendWebhookFollowup(webhookUrl, { content: "Rejected. PR closed, branch deleted." });
    }
  } catch (e) {
    console.error("[handleButtonInteraction] Error:", e);
    try {
      await sendWebhookFollowup(webhookUrl, { content: `Something went wrong: ${e instanceof Error ? e.message : "Unknown error"}` });
    } catch { /* webhook might have expired */ }
  }
}

// ── Modal submit handler ─────────────────────────────────────────────

async function handleModalSubmit(
  customId: string,
  discordUserId: string,
  interaction: { token: string; application_id: string; channel_id: string; message?: { id: string }; data?: { components?: { components?: { custom_id: string; value: string }[] }[] } },
) {
  const APP_ID = process.env.DISCORD_APP_ID!;
  const webhookUrl = `https://discord.com/api/v10/webhooks/${APP_ID}/${interaction.token}`;

  try {
    const supabase = createServiceClient();
    const userId = await resolveUser(supabase, discordUserId);

    if (!userId) {
      await sendWebhookFollowup(webhookUrl, { content: "I don't know who you are." });
      return;
    }

    const ctx = await getHouseholdContext(supabase, userId);
    if (!ctx || ctx.role !== "admin") {
      await sendWebhookFollowup(webhookUrl, { content: "Only admins can approve pipeline actions." });
      return;
    }

    // Extract text input values from modal
    const fields: Record<string, string> = {};
    for (const row of interaction.data?.components || []) {
      for (const comp of row.components || []) {
        fields[comp.custom_id] = comp.value || "";
      }
    }

    if (customId.startsWith("modal_approve_")) {
      const feedbackId = customId.replace("modal_approve_", "");
      const notes = fields.notes?.trim();

      // Status guard: only approve if status is appropriate (new, open, or previously rejected/failed)
      const { data: existing } = await platform(supabase)
        .from("feedback")
        .select("body, status, pipeline_status, discord_message_id, type")
        .eq("id", feedbackId)
        .single();

      if (!existing) {
        await sendWebhookFollowup(webhookUrl, { content: "Feedback not found." });
        return;
      }

      // Don't re-queue items that are already in the pipeline (working, preview_ready, shipped)
      const blockingStatuses = ["working", "preview_ready", "shipped"];
      if (existing.pipeline_status && blockingStatuses.includes(existing.pipeline_status)) {
        await sendWebhookFollowup(webhookUrl, { content: `Can't approve — already ${existing.pipeline_status}.` });
        return;
      }

      // Build update
      const updatePayload: Record<string, unknown> = {
        status: "planned",
        pipeline_status: "queued",
        updated_at: new Date().toISOString(),
      };
      if (notes) {
        updatePayload.body = `${existing.body}\n\n---\nAdmin notes: ${notes}`;
      }

      await platform(supabase)
        .from("feedback")
        .update(updatePayload)
        .eq("id", feedbackId);

      // Trigger GitHub Action via repository_dispatch
      const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
      const GITHUB_REPO = process.env.GITHUB_REPO || "plewis000/starbase";
      if (GITHUB_TOKEN) {
        const dispatchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event_type: "pipeline-job",
            client_payload: {
              feedback_id: feedbackId,
              type: existing.type || "feedback",
              description: (notes ? `${existing.body}\n\nAdmin notes: ${notes}` : existing.body).slice(0, 500),
            },
          }),
        });
        if (!dispatchRes.ok) {
          console.error("[pipeline] GitHub dispatch failed:", dispatchRes.status);
        }
      }

      const confirmMsg = notes
        ? `Approved with notes — queued for GitHub Action.\n> ${notes.slice(0, 200)}`
        : "Approved — queued for GitHub Action.";
      await sendWebhookFollowup(webhookUrl, { content: confirmMsg });

      // Remove buttons from original embed
      if (existing.discord_message_id && process.env.PIPELINE_CHANNEL_ID) {
        const typeEmoji: Record<string, string> = { bug: "🐛", wish: "⭐", feedback: "💬", question: "❓" };
        await editMessage(process.env.PIPELINE_CHANNEL_ID, existing.discord_message_id, {
          embeds: [{
            title: `${typeEmoji[existing.type] || "💬"} ${existing.type} — ✅ Approved`,
            description: (notes ? `${existing.body}\n\n---\nAdmin notes: ${notes}` : existing.body).slice(0, 2000),
            color: 0x2ecc71, // green
            footer: { text: `ID: ${feedbackId.slice(0, 8)} | Queued for worker` },
          }],
          components: [],
        });
      }

    } else if (customId.startsWith("modal_wontfix_")) {
      const feedbackId = customId.replace("modal_wontfix_", "");
      const reason = fields.reason?.trim();

      // Status guard
      const { data: existing } = await platform(supabase)
        .from("feedback")
        .select("status, pipeline_status, discord_message_id, body, type")
        .eq("id", feedbackId)
        .single();

      if (!existing) {
        await sendWebhookFollowup(webhookUrl, { content: "Feedback not found." });
        return;
      }

      if (existing.pipeline_status === "shipped") {
        await sendWebhookFollowup(webhookUrl, { content: "Already shipped — can't mark as won't fix." });
        return;
      }

      if (existing.status === "wont_fix") {
        await sendWebhookFollowup(webhookUrl, { content: "Already marked as won't fix." });
        return;
      }

      const updateFields: Record<string, unknown> = {
        status: "wont_fix",
        pipeline_status: "rejected", // Set pipeline_status too
        updated_at: new Date().toISOString(),
      };
      if (reason) {
        updateFields.worker_log = `Won't fix reason: ${reason}`;
      }

      await platform(supabase)
        .from("feedback")
        .update(updateFields)
        .eq("id", feedbackId);

      const confirmMsg = reason
        ? `Marked as won't fix.\n> ${reason.slice(0, 200)}`
        : "Marked as won't fix.";
      await sendWebhookFollowup(webhookUrl, { content: confirmMsg });

      // Remove buttons from original embed
      if (existing.discord_message_id && process.env.PIPELINE_CHANNEL_ID) {
        const typeEmoji: Record<string, string> = { bug: "🐛", wish: "⭐", feedback: "💬", question: "❓" };
        await editMessage(process.env.PIPELINE_CHANNEL_ID, existing.discord_message_id, {
          embeds: [{
            title: `${typeEmoji[existing.type] || "💬"} ${existing.type} — 🚫 Won't Fix`,
            description: existing.body.slice(0, 2000),
            color: 0xe74c3c, // red
            footer: { text: `ID: ${feedbackId.slice(0, 8)} | ${reason ? `Reason: ${reason.slice(0, 100)}` : "Closed"}` },
          }],
          components: [],
        });
      }
    }
  } catch (e) {
    console.error("[handleModalSubmit] Error:", e);
    try {
      await sendWebhookFollowup(webhookUrl, { content: `Something went wrong: ${e instanceof Error ? e.message : "Unknown error"}` });
    } catch { /* webhook might have expired */ }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

async function resolveUser(supabase: Supabase, discordUserId: string): Promise<string | null> {
  const { data } = await platform(supabase)
    .from("user_preferences")
    .select("user_id")
    .eq("preference_key", "discord_user_id")
    .eq("preference_value", JSON.stringify(discordUserId))
    .single();

  if (data) return data.user_id;

  // No fallback — user must have linked their Discord account
  return null;
}

async function sendWebhook(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[sendWebhook] Failed:", res.status, text);
  }
}

// For deferred interactions (type 5): send follow-up message
const sendWebhookFollowup = sendWebhook;

async function logToChannel(summary: string) {
  try {
    const channels = await getGuildChannels();
    const logsChannel = channels.find((c) => c.name === CHANNELS.LOGS);
    if (logsChannel) {
      await sendMessage(logsChannel.id, `\`${new Date().toISOString().slice(11, 19)}\` ${summary}`);
    }
  } catch {
    // Non-critical
  }
}

export { runAgent, resolveUser };
