import { NextRequest, NextResponse, after } from "next/server";
import { verifyKey } from "discord-interactions";
import { sendMessage, sendEmbed, sendMessageWithButtons, editMessage, findChannelByName, CHANNELS, ZEV_COLOR, SYSTEM_COLOR, getGuildChannels } from "@/lib/discord";
import { getHouseholdContext, getHouseholdMemberIds } from "@/lib/household";
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
import { extractLearnings, buildUserContext } from "@/lib/agent/learning";

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
     For quick start: "📋 **Speed Registration**\n\nThe System has registered you. You're in. Welcome to The Keep — the exit is behind you. It is locked.\n\nI'll ask you a few things over time so I can actually be useful. No rush."
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

The Keep uses dungeon crawler theming. You're the friendly guide in a world run by a sarcastic omniscient System. Lean into it naturally — "the crawl," "floors," "XP" — but don't overdo it. The theming should feel like the way things just are, not a performance.`;

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

    if (!discordUserId) {
      return NextResponse.json({ type: 4, data: { content: "Couldn't identify your Discord account." } });
    }

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

    if (customId.startsWith("pipeline_backlog_")) {
      const feedbackId = customId.replace("pipeline_backlog_", "");
      return NextResponse.json({
        type: 9, // MODAL
        data: {
          custom_id: `modal_backlog_${feedbackId}`,
          title: "Add to Backlog",
          components: [{
            type: 1,
            components: [{
              type: 4,
              custom_id: "notes",
              label: "Notes (optional)",
              style: 2,
              required: false,
              placeholder: "e.g. 'Low priority' or 'Bundle with next sprint'",
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
          title: "Decline",
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

    // /help and /link run before user resolution
    if (commandName === "help") {
      await sendWebhook(webhookUrl, {
        content: [
          "**Available Commands:**",
          "`/link` — Link your Discord to the app (do this first)",
          "`/task` — Create a new task",
          "`/habit` — Check in to a habit",
          "`/budget` — Get spending summary",
          "`/shop` — Add items to shopping list",
          "`/dashboard` — Your daily overview",
          "`/crawl` — View your crawler profile & stats",
          "`/ask` — Ask Zev anything (uses AI)",
          "`/focus` — Get your prioritized focus list",
          "`/nudge` — Check what needs attention now",
          "`/review` — Get your weekly review",
          "`/feedback` — Submit a bug, wish, or feedback",
          "`/start` — Get set up with Zev (free onboarding)",
          "`/answer` — Answer onboarding questions (free)",
          "`/usage` — Check API usage and costs",
          "`/pipeline` — Show active pipeline jobs",
        ].join("\n"),
      });
      return;
    }

    // /link runs before user resolution — it creates the link
    if (commandName === "link") {
      return await handleLink(supabase, discordUserId, options, webhookUrl);
    }

    // /feedback and /pipeline work without a linked account
    if (commandName === "feedback") {
      const userId = await resolveUser(supabase, discordUserId);
      return await handleFeedback(supabase, userId, discordUserId, options, webhookUrl);
    }
    if (commandName === "pipeline") {
      return await handlePipeline(supabase, webhookUrl);
    }

    const userId = await resolveUser(supabase, discordUserId);

    if (!userId) {
      await sendWebhook(webhookUrl, {
        content: "I don't know who you are yet. Use **/link** with your email to connect your Discord account, or ask Parker to help.",
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
      case "review":
        return await handleReview(supabase, userId, webhookUrl);
      case "nudge":
        return await handleNudge(supabase, userId, webhookUrl);
      case "focus":
        return await handleFocus(supabase, userId, webhookUrl);
      case "start":
        return await handleStart(supabase, userId, options, webhookUrl);
      case "answer":
        return await handleAnswer(supabase, userId, options, webhookUrl);
      default:
        await sendWebhook(webhookUrl, { content: `Unknown command: ${commandName}` });
    }
  } catch (err) {
    console.error("Discord command error:", err);
    try {
      await sendWebhook(webhookUrl, {
        content: "Something broke on my end. Not your fault. Try again in a sec.",
      });
    } catch { /* webhook token may have expired */ }
  }
}

// ── Link handler (runs before user resolution) ──────────────────────

async function handleLink(supabase: Supabase, discordUserId: string, options: Record<string, unknown>, webhookUrl: string) {
  const email = (options.email as string || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    await sendWebhook(webhookUrl, { content: "Please provide a valid email address." });
    return;
  }

  // Check if already linked
  const { data: existing } = await platform(supabase)
    .from("user_preferences")
    .select("user_id")
    .eq("preference_key", "discord_user_id")
    .eq("preference_value", JSON.stringify(discordUserId))
    .maybeSingle();

  if (existing) {
    await sendWebhook(webhookUrl, { content: "Your Discord is already linked! You're good to go — try **/dashboard** or **/task**." });
    return;
  }

  // Find the user by email in auth.users (need to match against platform.users which stores email)
  const { data: user } = await platform(supabase)
    .from("users")
    .select("id, email, full_name")
    .eq("email", email)
    .maybeSingle();

  if (!user) {
    await sendWebhook(webhookUrl, {
      content: `No account found for **${email}**. Make sure you've signed up at https://starbase-green.vercel.app first, then try again.`,
    });
    return;
  }

  // Security: verify the Discord user is linking their OWN account.
  // The email owner must have the same Discord ID stored, OR the linker must be an admin.
  // Check if the person running /link is already a known admin
  const { data: linkerPref } = await platform(supabase)
    .from("user_preferences")
    .select("user_id")
    .eq("preference_key", "discord_user_id")
    .eq("preference_value", JSON.stringify(discordUserId))
    .maybeSingle();

  const isAdmin = linkerPref ? await checkIsAdmin(supabase, linkerPref.user_id) : false;

  // Self-linking: verify the email matches by checking that the target user's
  // email domain matches and the Discord user ID hasn't been used before.
  // For non-admin users, require that the target email matches what Discord knows.
  if (!isAdmin) {
    // Rate limit: check if there have been too many link attempts from this Discord user
    const { data: recentAttempts } = await platform(supabase)
      .from("user_preferences")
      .select("id")
      .eq("preference_key", `link_attempt_${discordUserId}`)
      .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

    if (recentAttempts && recentAttempts.length >= 3) {
      await sendWebhook(webhookUrl, { content: "Too many link attempts. Please wait 15 minutes and try again, or ask an admin for help." });
      return;
    }

    // Log this attempt
    Promise.resolve(platform(supabase)
      .from("user_preferences")
      .insert({
        user_id: user.id,
        preference_key: `link_attempt_${discordUserId}`,
        preference_value: JSON.stringify({ email, timestamp: Date.now() }),
      })).catch(() => {}); // Non-critical
  }

  // Check they're in a household
  const { data: membership } = await platform(supabase)
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    await sendWebhook(webhookUrl, {
      content: `Found your account, but you haven't joined a household yet. Go to https://starbase-green.vercel.app/join and enter your invite code first.`,
    });
    return;
  }

  // Check that no OTHER Discord user is already linked to this account
  const { data: existingLink } = await platform(supabase)
    .from("user_preferences")
    .select("preference_value")
    .eq("user_id", user.id)
    .eq("preference_key", "discord_user_id")
    .maybeSingle();

  if (existingLink) {
    await sendWebhook(webhookUrl, {
      content: "This account is already linked to a different Discord user. Contact an admin if this is an error.",
    });
    return;
  }

  // Link Discord
  const { error } = await platform(supabase)
    .from("user_preferences")
    .insert({
      user_id: user.id,
      preference_key: "discord_user_id",
      preference_value: JSON.stringify(discordUserId),
    });

  if (error) {
    console.error("Discord link failed:", error.message);
    await sendWebhook(webhookUrl, { content: "Something went wrong linking your account. Try again or ask Parker for help." });
    return;
  }

  const name = user.full_name || email.split("@")[0];

  // Check if user has completed onboarding
  const { data: onboardingState } = await platform(supabase)
    .from("onboarding_state")
    .select("current_phase")
    .eq("user_id", user.id)
    .maybeSingle();

  const isNew = !onboardingState || onboardingState.current_phase === "not_started";

  if (isNew) {
    await sendWebhook(webhookUrl, {
      content: [
        `Linked! Welcome to The Keep, **${name}**.`,
        "",
        "I'm Zev — your household's executive assistant. I handle tasks, habits, shopping, budgets, and keeping you two organized.",
        "",
        "**Pick how you want to get started:**",
      ].join("\n"),
      components: [{
        type: 1, // Action row
        components: [
          {
            type: 2, // Button
            style: 1, // Primary (blurple)
            label: "Quick Start (10 sec)",
            custom_id: "onboard_quick",
          },
          {
            type: 2,
            style: 2, // Secondary (grey)
            label: "Full Interview (~5 min)",
            custom_id: "onboard_full",
          },
        ],
      }],
    });
  } else {
    await sendWebhook(webhookUrl, {
      content: `Linked! Welcome back, **${name}**. You now have full access to all slash commands.\n\nTry these:\n• **/dashboard** — your daily overview\n• **/task** — create a task\n• **/shop** — add to shopping list\n• **/habit** — check in to a habit\n• **/ask** — ask me anything`,
    });
  }
}

async function checkIsAdmin(supabase: Supabase, userId: string): Promise<boolean> {
  const { data } = await platform(supabase)
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role === "admin";
}

// ── Direct command handlers (no Claude API cost) ──────────────────────

async function handleTask(supabase: Supabase, userId: string, options: Record<string, unknown>, webhookUrl: string) {
  const title = options.title as string;
  const due = options.due as string | undefined;
  const priorityName = options.priority as string | undefined;
  const assignName = options.assign as string | undefined;

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

  // Resolve assign name to household member
  let assigneeId = userId;
  let assigneeName: string | undefined;
  if (assignName) {
    const { getHouseholdContext, getHouseholdMemberIds } = await import("@/lib/household");
    const hCtx = await getHouseholdContext(supabase, userId);
    if (hCtx) {
      const memberIds = await getHouseholdMemberIds(supabase, hCtx.household_id);
      const { data: members } = await platform(supabase)
        .from("users")
        .select("id, full_name")
        .in("id", memberIds);
      const assignMatch = members?.find((m) =>
        m.full_name?.toLowerCase().includes(assignName.toLowerCase())
      );
      if (assignMatch) {
        assigneeId = assignMatch.id;
        assigneeName = assignMatch.full_name || undefined;
      } else {
        await sendWebhook(webhookUrl, { content: `No household member matching "${assignName}".` });
        return;
      }
    }
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
    assigned_to: assigneeId,
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
    console.error("Discord task create failed:", error.message);
    await sendWebhook(webhookUrl, { content: "Couldn't create task. Something went wrong." });
    return;
  }

  const fields = [];
  if (due) fields.push({ name: "Due", value: due, inline: true });
  if (priorityName) fields.push({ name: "Priority", value: priorityName.charAt(0).toUpperCase() + priorityName.slice(1), inline: true });
  if (assigneeName && assigneeId !== userId) fields.push({ name: "Assigned to", value: assigneeName, inline: true });

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
  const habitName = options.name as string;
  const action = (options.action as string) || "checkin";

  // Handle create action
  if (action === "create") {
    // Get default frequency (daily)
    const { data: defaultFreq } = await config(supabase)
      .from("habit_frequencies")
      .select("id")
      .eq("target_type", "daily")
      .limit(1)
      .single();

    if (!defaultFreq) {
      await sendWebhook(webhookUrl, { content: "Couldn't create habit — no frequency config found." });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: newHabit, error } = await platform(supabase)
      .from("habits")
      .insert({
        title: habitName,
        owner_id: userId,
        frequency_id: defaultFreq.id,
        status: "active",
        target_count: 1,
        started_on: today,
        current_streak: 0,
        longest_streak: 0,
      })
      .select("id, title")
      .single();

    if (error) {
      console.error("Discord habit create failed:", error.message);
      await sendWebhook(webhookUrl, { content: "Couldn't create habit. Something went wrong." });
      return;
    }

    await sendWebhook(webhookUrl, {
      embeds: [{
        title: "Habit created",
        description: `**${newHabit.title}** — daily, starting today.\nCheck in with \`/habit ${newHabit.title}\``,
        color: ZEV_COLOR,
        footer: { text: "Free command — no API cost" },
      }],
    });
    return;
  }

  const searchName = habitName.toLowerCase();

  // Find habit by name (fuzzy match) — include frequency for streak engine
  const { data: habits } = await platform(supabase)
    .from("habits")
    .select("id, title, current_streak, longest_streak, frequency_id, target_count, started_on")
    .eq("owner_id", userId)
    .eq("status", "active");

  if (!habits || habits.length === 0) {
    await sendWebhook(webhookUrl, {
      embeds: [{
        description: `You don't have any habits yet. Create one:\n\`/habit ${habitName} action:Create\``,
        color: ZEV_COLOR,
      }],
    });
    return;
  }

  // Find best match: exact, starts with, or contains
  const match = habits.find((h) => h.title.toLowerCase() === searchName)
    || habits.find((h) => h.title.toLowerCase().startsWith(searchName))
    || habits.find((h) => h.title.toLowerCase().includes(searchName));

  if (!match) {
    const names = habits.map((h) => h.title).join(", ");
    await sendWebhook(webhookUrl, {
      embeds: [{
        description: `No habit matching "${habitName}".\n\nYour habits: ${names}\n\nOr create it: \`/habit ${habitName} action:Create\``,
        color: ZEV_COLOR,
      }],
    });
    return;
  }

  // Check if already checked in today
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await platform(supabase)
    .from("habit_check_ins")
    .select("id")
    .eq("habit_id", match.id)
    .eq("checked_by", userId)
    .eq("check_date", today)
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
    .insert({ habit_id: match.id, checked_by: userId, check_date: today });

  if (error) {
    console.error("Discord habit check-in failed:", error.message);
    await sendWebhook(webhookUrl, { content: "Check-in failed. Something went wrong." });
    return;
  }

  // Recalculate streak using the proper engine (matches web behavior)
  const { recalculateAndUpdateStreak } = await import("@/lib/streak-engine");
  const { data: freq } = await config(supabase)
    .from("habit_frequencies")
    .select("target_type")
    .eq("id", match.frequency_id)
    .single();
  const targetType = (freq?.target_type as "daily" | "weekly" | "monthly") || "daily";
  const streakResult = await recalculateAndUpdateStreak(
    supabase, match.id, match.target_count || 1, targetType, match.started_on || today
  );
  const newStreak = streakResult.current_streak;

  // Award XP for habit check-in (matches web: base 15 + streak bonus combined)
  await ensureProfile(supabase, userId);
  let xpAmount = 15;
  if (newStreak >= 90) xpAmount += 50;
  else if (newStreak >= 30) xpAmount += 25;
  else if (newStreak >= 7) xpAmount += 10;

  const xpResult = await awardXp(
    supabase, userId, xpAmount, "habit_check_in",
    `Habit check-in${newStreak > 1 ? ` (${newStreak}-day streak)` : ""}`,
    "habit", match.id
  );

  // Check streak milestone achievements
  const achievementUnlocks = await checkAchievements(supabase, userId, "habit_streak", { current_streak: newStreak });

  const streakEmoji = newStreak >= 7 ? "🔥" : newStreak >= 3 ? "⚡" : "✓";

  await sendWebhook(webhookUrl, {
    embeds: [{
      description: `${streakEmoji} **${match.title}** — checked in. Streak: **${newStreak}** day${newStreak !== 1 ? "s" : ""}.\n+${xpResult.xpAwarded} XP`,
      color: ZEV_COLOR,
      footer: { text: "Free command — no API cost" },
    }],
  });

  // Send achievement notifications via The System's voice
  if (achievementUnlocks.length > 0) {
    const channels = await getGuildChannels();
    const generalCh = channels.find(c => c.name === CHANNELS.GENERAL);
    if (generalCh) {
      for (const unlock of achievementUnlocks) {
        const notification = formatAchievement(unlock.achievementName, unlock.description, unlock.xpReward, unlock.lootBoxTier);
        await sendEmbed(generalCh.id, toDiscordEmbed(notification));
      }
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

  // Get household member IDs so we find any household member's shopping list
  const ctx = await getHouseholdContext(supabase, userId);
  const memberIds = ctx ? await getHouseholdMemberIds(supabase, ctx.household_id) : [userId];

  // Get default shopping list (any household member's)
  const { data: lists } = await household(supabase)
    .from("shopping_lists")
    .select("id, name")
    .in("created_by", memberIds)
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
    console.error("Discord shopping add failed:", error.message);
    await sendWebhook(webhookUrl, { content: "Couldn't add items. Something went wrong." });
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
    .eq("check_date", today);

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
  // Rate limit: 10 /ask commands per minute per user (costs real money)
  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rl = checkRateLimit(`discord_ask:${userId}`, 10, 60_000);
  if (!rl.allowed) {
    await sendWebhook(webhookUrl, {
      content: `Slow down — you're sending too many requests. Try again in ${rl.retryAfter}s.`,
    });
    return;
  }

  const message = options.message as string;
  if (!message?.trim()) {
    await sendWebhook(webhookUrl, { content: "You didn't ask me anything." });
    return;
  }

  const response = await runAgent(supabase, userId, message.trim(), "discord", interaction.channel_id);

  const costStr = `$${(response.costCents / 100).toFixed(4)}`;

  // Discord has a 2000-char limit — split long responses
  const chunks = splitForDiscord(response.text, 1900); // Leave room for cost embed
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const payload: Record<string, unknown> = { content: chunks[i] };
    if (isLast) {
      payload.embeds = [{ color: 0x2F3136, footer: { text: `Cost: ${costStr}` } }];
    }
    await sendWebhook(webhookUrl, payload);
  }

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
  // Reuse recent conversation in same Discord channel (within 30 min) for continuity
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recentConv } = await platform(supabase)
    .from("agent_conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("channel_id", channelId)
    .gte("last_message_at", thirtyMinAgo)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId: string | null = recentConv?.id || null;

  if (!conversationId) {
    const { data: conv } = await platform(supabase)
      .from("agent_conversations")
      .insert({ user_id: userId, channel, channel_id: channelId })
      .select("id")
      .single();
    conversationId = conv?.id || null;
  }

  if (conversationId) {
    await platform(supabase)
      .from("agent_messages")
      .insert({ conversation_id: conversationId, role: "user", content: message });
  }

  // Load conversation history for context (up to last 20 messages)
  let priorMessages: { role: "user" | "assistant"; content: string }[] = [];
  if (conversationId) {
    const { data: history } = await platform(supabase)
      .from("agent_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(20);

    if (history) {
      for (const msg of history) {
        if (msg.role === "user" || msg.role === "assistant") {
          priorMessages.push({ role: msg.role as "user" | "assistant", content: msg.content });
        }
      }
    }
  }

  // Ensure messages alternate correctly
  priorMessages = ensureAlternation(priorMessages);

  // If no history loaded, at least have the current message
  if (priorMessages.length === 0) {
    priorMessages = [{ role: "user", content: message }];
  }

  const tier = routeModel(message);
  const model = getModel(tier);

  // Build per-user context for personalization
  const userContext = await buildUserContext(supabase, userId);
  const enrichedPrompt = userContext
    ? `${DISCORD_SYSTEM_PROMPT}\n\n<user_context>\n${userContext}\n</user_context>`
    : DISCORD_SYSTEM_PROMPT;

  let response = await anthropic.messages.create({
    model,
    max_tokens: MAX_RESPONSE_TOKENS,
    system: enrichedPrompt,
    tools: AGENT_TOOLS,
    messages: priorMessages,
  });

  let totalInputTokens = response.usage.input_tokens;
  let totalOutputTokens = response.usage.output_tokens;
  let toolRounds = 0;
  const toolNames: string[] = [];

  // Accumulate full message chain for multi-round tool use
  const accumulatedMessages: { role: string; content: unknown }[] = priorMessages.map(m => ({ ...m }));

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
        Promise.resolve(platform(supabase)
          .from("agent_actions")
          .insert({
            conversation_id: conversationId,
            user_id: userId,
            action_type: toolCall.name,
            summary: `${toolCall.name}(${JSON.stringify(toolCall.input).slice(0, 200)})`,
            channel,
          })).catch(() => {});
      }

      toolResults.push({
        type: "tool_result" as const,
        tool_use_id: toolCall.id,
        content: JSON.stringify(result.success ? result.data : { error: result.error }),
      });
    }

    // Accumulate context — previous rounds are preserved
    accumulatedMessages.push({ role: "assistant", content: response.content });
    accumulatedMessages.push({ role: "user", content: toolResults });

    response = await anthropic.messages.create({
      model,
      max_tokens: MAX_RESPONSE_TOKENS,
      system: enrichedPrompt,
      tools: AGENT_TOOLS,
      messages: accumulatedMessages as Parameters<typeof anthropic.messages.create>[0]["messages"],
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

    // Update conversation timestamp for continuity detection
    Promise.resolve(platform(supabase)
      .from("agent_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId)
    ).catch(() => {});

    // Extract learnings (non-blocking)
    const convId = conversationId;
    const ctx = await getHouseholdContext(supabase, userId);
    extractLearnings(supabase, userId, ctx?.household_id || null, message, responseText, convId)
      .catch((err) => console.error("[learning] discord extraction failed:", err));
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

  // Get overdue tasks count (for this user only)
  const { count: overdueCount } = await supabase
    .schema("platform")
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", userId)
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
      footer: { text: "The Keep — So fun it hurts." },
    }],
  });
}

// ── Review + Nudge commands ───────────────────────────────────────────

async function handleReview(supabase: Supabase, userId: string, webhookUrl: string) {
  const { generateWeeklyReview } = await import("@/lib/briefing-engine");
  const result = await generateWeeklyReview(supabase, userId);

  if (!result) {
    await sendWebhook(webhookUrl, { content: "Not enough data for a weekly review yet. Give it a few more days." });
    return;
  }

  const chunks = splitForDiscord(result.review, 4000);
  await sendWebhook(webhookUrl, {
    embeds: [{
      title: "Weekly Review",
      description: chunks[0],
      color: ZEV_COLOR,
      footer: { text: "Zev | Weekly Review" },
      timestamp: new Date().toISOString(),
    }],
  });

  for (let i = 1; i < chunks.length; i++) {
    await sendWebhook(webhookUrl, { content: chunks[i] });
  }
}

async function handleNudge(supabase: Supabase, userId: string, webhookUrl: string) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const nudges: string[] = [];

  // Unchecked habits
  const { data: activeHabits } = await platform(supabase)
    .from("habits")
    .select("id, title, current_streak")
    .eq("owner_id", userId)
    .eq("status", "active");

  const { data: todayCheckIns } = await platform(supabase)
    .from("habit_check_ins")
    .select("habit_id")
    .eq("checked_by", userId)
    .eq("check_date", todayStr);

  const checkedIds = new Set((todayCheckIns || []).map((c) => c.habit_id));
  const unchecked = (activeHabits || []).filter((h) => !checkedIds.has(h.id));

  if (unchecked.length > 0) {
    const atRisk = unchecked.filter((h) => h.current_streak > 0);
    if (atRisk.length > 0) {
      const names = atRisk.slice(0, 3).map((h) => `**${h.title}** (${h.current_streak}d streak)`).join(", ");
      nudges.push(`🔥 Streaks at risk: ${names}`);
    } else {
      const names = unchecked.slice(0, 3).map((h) => h.title).join(", ");
      nudges.push(`🔄 Unchecked habits: ${names}`);
    }
  }

  // Overdue tasks
  const { data: overdueTasks } = await platform(supabase)
    .from("tasks")
    .select("title")
    .contains("owner_ids", [userId])
    .lt("due_date", todayStr)
    .is("completed_at", null)
    .limit(5);

  if (overdueTasks && overdueTasks.length > 0) {
    const names = overdueTasks.slice(0, 3).map((t) => `**${t.title}**`).join(", ");
    nudges.push(`⚠️ Overdue: ${names}${overdueTasks.length > 3 ? ` +${overdueTasks.length - 3} more` : ""}`);
  }

  // Tasks due today
  const { data: todayTasks } = await platform(supabase)
    .from("tasks")
    .select("title")
    .contains("owner_ids", [userId])
    .eq("due_date", todayStr)
    .is("completed_at", null)
    .limit(5);

  if (todayTasks && todayTasks.length > 0) {
    const names = todayTasks.slice(0, 3).map((t) => t.title).join(", ");
    nudges.push(`📋 Due today: ${names}`);
  }

  // Pending suggestions
  const { data: suggestions } = await platform(supabase)
    .from("ai_suggestions")
    .select("title")
    .eq("user_id", userId)
    .eq("status", "pending")
    .limit(1);

  if (suggestions && suggestions.length > 0) {
    nudges.push(`💡 Suggestion: ${suggestions[0].title}`);
  }

  if (nudges.length === 0) {
    await sendWebhook(webhookUrl, {
      embeds: [{
        title: "All Clear",
        description: "Nothing urgent. You're caught up. Nice.",
        color: 0x22c55e,
        footer: { text: "Zev | The Keep" },
      }],
    });
    return;
  }

  await sendWebhook(webhookUrl, {
    embeds: [{
      title: "What Needs Attention",
      description: nudges.join("\n\n"),
      color: nudges.some((n) => n.includes("Overdue")) ? 0xef4444 : 0xf59e0b,
      footer: { text: "Zev | The Keep" },
      timestamp: new Date().toISOString(),
    }],
  });
}

// ── Focus command ──────────────────────────────────────

async function handleFocus(supabase: Supabase, userId: string, webhookUrl: string) {
  const result = await executeTool(supabase, userId, "get_focus_tasks", {});

  if (!result.success) {
    await sendWebhook(webhookUrl, { content: "Couldn't generate focus list. Try again." });
    return;
  }

  const data = result.data as {
    focus_items: { type: string; title: string; urgency: string; reasons: string[] }[];
    total_open_tasks: number;
    overdue_count: number;
    habits_at_risk: number;
    message: string;
  };

  if (data.focus_items.length === 0) {
    await sendWebhook(webhookUrl, {
      embeds: [{
        title: "All Clear",
        description: "Nothing urgent right now. Enjoy the free time.",
        color: 0x22c55e,
        footer: { text: "Zev | The Keep" },
      }],
    });
    return;
  }

  const urgencyIcons: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  };

  const lines = data.focus_items.map((item) => {
    const icon = item.type === "habit" ? "🔥" : urgencyIcons[item.urgency] || "⚪";
    const reasons = item.reasons.length > 0 ? ` — ${item.reasons.join(", ")}` : "";
    return `${icon} **${item.title}**${reasons}`;
  });

  const statsLine = [
    data.overdue_count > 0 ? `${data.overdue_count} overdue` : null,
    data.habits_at_risk > 0 ? `${data.habits_at_risk} streaks at risk` : null,
    `${data.total_open_tasks} open tasks`,
  ].filter(Boolean).join(" · ");

  await sendWebhook(webhookUrl, {
    embeds: [{
      title: "Focus List",
      description: lines.join("\n\n"),
      color: data.focus_items.some(i => i.urgency === "critical") ? 0xef4444 : 0xf59e0b,
      footer: { text: `${statsLine} · Zev | The Keep` },
      timestamp: new Date().toISOString(),
    }],
  });
}

// ── Templated onboarding commands (free, no AI cost) ──────────────────

async function handleStart(supabase: Supabase, userId: string, options: Record<string, unknown>, webhookUrl: string) {
  const track = (options.track as string) || "quick";

  // Check existing onboarding state
  const hCtx = await getHouseholdContext(supabase, userId);
  if (!hCtx) {
    await sendWebhook(webhookUrl, { content: "You need to join a household first. Visit https://starbase-green.vercel.app/join" });
    return;
  }

  const { data: existing } = await platform(supabase)
    .from("onboarding_state")
    .select("current_phase, current_question_index")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing && existing.current_phase === "active") {
    await sendWebhook(webhookUrl, {
      embeds: [{
        description: "You're already set up! Try `/dashboard` for your overview or `/ask` to chat with Zev.",
        color: ZEV_COLOR,
      }],
    });
    return;
  }

  if (existing && existing.current_phase === "interview") {
    // Resume interview — send current question
    const questionIndex = existing.current_question_index || 0;
    await sendOnboardingQuestion(supabase, userId, questionIndex, webhookUrl);
    return;
  }

  if (track === "quick") {
    // Quick start: create onboarding state as active immediately
    await platform(supabase)
      .from("onboarding_state")
      .upsert({
        user_id: userId,
        household_id: hCtx.household_id,
        current_phase: "active",
        track: "quick",
        interview_started_at: new Date().toISOString(),
        interview_completed_at: new Date().toISOString(),
        metadata: { quick_start: true, started_via: "discord" },
      }, { onConflict: "user_id,household_id" });

    await sendWebhook(webhookUrl, {
      embeds: [{
        title: "You're in!",
        description: [
          "Quick start complete. Here's what you can do right now:",
          "",
          "**Get organized:**",
          "`/task Buy groceries` — create a task",
          "`/habit Morning workout` — start a habit",
          "`/shop Milk, eggs, bread` — add to shopping list",
          "",
          "**Stay on track:**",
          "`/dashboard` — your daily overview",
          "`/focus` — what to do right now",
          "`/nudge` — what needs attention",
          "",
          "**Talk to Zev (AI, costs a few cents):**",
          "`/ask Hey Zev, what should I focus on?`",
          "",
          "I'll learn your patterns over time. The more you use me, the smarter I get.",
        ].join("\n"),
        color: ZEV_COLOR,
        footer: { text: "Zev | Quick Start Complete" },
      }],
    });
  } else {
    // Full interview: create state and send first question
    await platform(supabase)
      .from("onboarding_state")
      .upsert({
        user_id: userId,
        household_id: hCtx.household_id,
        current_phase: "interview",
        current_question_index: 0,
        track: "full",
        interview_started_at: new Date().toISOString(),
        metadata: { started_via: "discord" },
      }, { onConflict: "user_id,household_id" });

    await sendWebhook(webhookUrl, {
      embeds: [{
        title: "Let's get to know each other",
        description: "I'm going to ask you 10 questions so I can be actually useful. Takes about 5 minutes.\n\nAnswer each one with `/answer your response here`.\n\nLet's go!",
        color: ZEV_COLOR,
      }],
    });

    // Send first question
    await sendOnboardingQuestion(supabase, userId, 0, webhookUrl);
  }
}

async function sendOnboardingQuestion(supabase: Supabase, userId: string, questionIndex: number, webhookUrl: string) {
  const { data: questions } = await config(supabase)
    .from("onboarding_questions")
    .select("question_key, question_text, sort_order")
    .eq("active", true)
    .order("sort_order");

  if (!questions || questionIndex >= questions.length) {
    await sendWebhook(webhookUrl, { content: "No more questions! Finishing up..." });
    return;
  }

  const q = questions[questionIndex];
  await sendWebhook(webhookUrl, {
    embeds: [{
      title: `Question ${questionIndex + 1} of ${questions.length}`,
      description: q.question_text,
      color: 0x3b82f6,
      footer: { text: "Reply with /answer your response" },
    }],
  });
}

async function handleAnswer(supabase: Supabase, userId: string, options: Record<string, unknown>, webhookUrl: string) {
  const response = options.response as string;

  // Get onboarding state
  const { data: state } = await platform(supabase)
    .from("onboarding_state")
    .select("id, current_phase, current_question_index, household_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!state || state.current_phase !== "interview") {
    await sendWebhook(webhookUrl, {
      content: state?.current_phase === "active"
        ? "You're already done with onboarding! Use `/ask` to talk to Zev."
        : "Start onboarding first with `/start`.",
    });
    return;
  }

  // Get current question
  const { data: questions } = await config(supabase)
    .from("onboarding_questions")
    .select("question_key, question_text, sort_order")
    .eq("active", true)
    .order("sort_order");

  if (!questions) {
    await sendWebhook(webhookUrl, { content: "Couldn't load questions. Try again." });
    return;
  }

  const questionIndex = state.current_question_index || 0;
  if (questionIndex >= questions.length) {
    await sendWebhook(webhookUrl, { content: "All questions answered! Finishing up..." });
    return;
  }

  const currentQ = questions[questionIndex];

  // Store the response
  await platform(supabase)
    .from("onboarding_responses")
    .insert({
      onboarding_id: state.id,
      user_id: userId,
      question_key: currentQ.question_key,
      question_text: currentQ.question_text,
      raw_response: response,
      phase: "interview",
      channel: "discord",
    });

  const nextIndex = questionIndex + 1;
  const isLast = nextIndex >= questions.length;

  if (isLast) {
    // Complete the interview
    await platform(supabase)
      .from("onboarding_state")
      .update({
        current_phase: "active",
        current_question_index: nextIndex,
        interview_completed_at: new Date().toISOString(),
      })
      .eq("id", state.id);

    // Generate observations from responses
    try {
      const { generateObservationsFromOnboarding } = await import("@/lib/observation-generator");
      await generateObservationsFromOnboarding(supabase, userId, state.household_id, state.id);
    } catch (err) {
      console.error("[onboarding] Observation generation failed:", err);
    }

    await sendWebhook(webhookUrl, {
      embeds: [{
        title: "Onboarding Complete",
        description: [
          "Got it — I've got a much better picture of you now.",
          "",
          "**What's next:**",
          "`/task` — create tasks",
          "`/habit` — start tracking habits",
          "`/dashboard` — your daily overview",
          "`/ask` — chat with Zev anytime (AI-powered)",
          "",
          "I'll use what you told me to give better advice, smarter nudges, and more relevant suggestions.",
        ].join("\n"),
        color: ZEV_COLOR,
        footer: { text: "Zev | Interview Complete" },
      }],
    });
  } else {
    // Advance to next question
    await platform(supabase)
      .from("onboarding_state")
      .update({ current_question_index: nextIndex })
      .eq("id", state.id);

    await sendWebhook(webhookUrl, {
      embeds: [{
        description: `Got it. (${nextIndex}/${questions.length})`,
        color: ZEV_COLOR,
      }],
    });

    // Send next question
    await sendOnboardingQuestion(supabase, userId, nextIndex, webhookUrl);
  }
}

// ── Feedback + Pipeline commands ──────────────────────────────────────

async function handleFeedback(supabase: Supabase, userId: string | null, discordUserId: string, options: Record<string, unknown>, webhookUrl: string) {
  const description = options.description as string;
  const type = (options.type as string) || "feedback";

  // For unlinked users, resolve household from guild's admin user
  // Feedback still gets posted to #pipeline for review regardless
  let effectiveUserId = userId;
  let ctx = userId ? await getHouseholdContext(supabase, userId) : null;

  if (!effectiveUserId) {
    // Find any household admin to attribute the feedback to
    const { data: admin } = await platform(supabase)
      .from("household_members")
      .select("user_id, household_id")
      .eq("role", "admin")
      .limit(1)
      .single();
    if (admin) {
      effectiveUserId = admin.user_id;
      ctx = { household_id: admin.household_id, role: "admin", user_id: admin.user_id, timezone: "America/Chicago" };
    }
  }

  if (!effectiveUserId) {
    await sendWebhook(webhookUrl, { content: "Couldn't submit feedback — no household found. Use **/link** to connect your account first." });
    return;
  }

  // Create feedback entry — stores Discord user ID in metadata for unlinked users
  const { data: feedback, error } = await platform(supabase)
    .from("feedback")
    .insert({
      household_id: ctx?.household_id || null,
      submitted_by: effectiveUserId,
      type,
      body: userId ? description : `[Discord: ${discordUserId}] ${description}`,
      source: "discord",
    })
    .select("id, type, body, status, created_at")
    .single();

  if (error) {
    console.error("Discord feedback submit failed:", error.message);
    await sendWebhook(webhookUrl, { content: "Couldn't submit feedback. Something went wrong." });
    return;
  }

  // Auto-upvote (fire-and-forget) — only if linked
  if (userId) {
    Promise.resolve(platform(supabase).from("feedback_votes").insert({ feedback_id: feedback.id, user_id: userId })).catch(() => {});
  }

  // Post approval buttons to #pipeline for admin review
  const pipelineChannelId = await findChannelByName(CHANNELS.PIPELINE);
  if (pipelineChannelId) {
    const typeEmoji: Record<string, string> = { bug: "🐛", wish: "⭐", feedback: "💬", question: "❓" };
    const messageId = await sendMessageWithButtons(pipelineChannelId, {
      embeds: [{
        title: `${typeEmoji[type] || "💬"} New ${type}`,
        description: description.slice(0, 2000),
        color: ZEV_COLOR,
        footer: { text: `ID: ${feedback.id.slice(0, 8)} | Source: discord` },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: "Ship It", custom_id: `pipeline_approve_${feedback.id}`, emoji: { name: "✅" } },
          { type: 2, style: 1, label: "Backlog", custom_id: `pipeline_backlog_${feedback.id}`, emoji: { name: "📋" } },
          { type: 2, style: 4, label: "Decline", custom_id: `pipeline_wontfix_${feedback.id}`, emoji: { name: "🚫" } },
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

    // Onboarding buttons — no admin required
    if (customId === "onboard_quick" || customId === "onboard_full") {
      const track = customId === "onboard_quick" ? "quick" : "full";
      await handleStart(supabase, userId, { track }, webhookUrl);
      // Disable buttons on the original message
      if (interaction.message?.id) {
        await editMessage(interaction.channel_id, interaction.message.id, {
          components: [],
        });
      }
      return;
    }

    // Check admin role for pipeline buttons
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
        .update({ pipeline_status: "shipped", status: "done", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { count: "exact" })
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
      const approveChannelId = await findChannelByName(CHANNELS.PIPELINE);
      if (existing.discord_message_id && approveChannelId) {
        const typeEmoji: Record<string, string> = { bug: "🐛", wish: "⭐", feedback: "💬", question: "❓" };
        await editMessage(approveChannelId, existing.discord_message_id, {
          embeds: [{
            title: `${typeEmoji[existing.type] || "💬"} ${existing.type} — ✅ Shipping`,
            description: (notes ? `${existing.body}\n\n---\nAdmin notes: ${notes}` : existing.body).slice(0, 2000),
            color: 0x2ecc71, // green
            footer: { text: `ID: ${feedbackId.slice(0, 8)} | Queued for worker` },
          }],
          components: [],
        });
      }

    } else if (customId.startsWith("modal_backlog_")) {
      const feedbackId = customId.replace("modal_backlog_", "");
      const notes = fields.notes?.trim();

      const { data: existing } = await platform(supabase)
        .from("feedback")
        .select("body, status, pipeline_status, discord_message_id, type")
        .eq("id", feedbackId)
        .single();

      if (!existing) {
        await sendWebhookFollowup(webhookUrl, { content: "Feedback not found." });
        return;
      }

      const blockingStatuses = ["working", "preview_ready", "shipped"];
      if (existing.pipeline_status && blockingStatuses.includes(existing.pipeline_status)) {
        await sendWebhookFollowup(webhookUrl, { content: `Can't backlog — already ${existing.pipeline_status}.` });
        return;
      }

      const updatePayload: Record<string, unknown> = {
        status: "planned",
        pipeline_status: null, // No pipeline dispatch — stays local
        updated_at: new Date().toISOString(),
      };
      if (notes) {
        updatePayload.body = `${existing.body}\n\n---\nBacklog notes: ${notes}`;
      }

      await platform(supabase)
        .from("feedback")
        .update(updatePayload)
        .eq("id", feedbackId);

      const confirmMsg = notes
        ? `Added to backlog.\n> ${notes.slice(0, 200)}`
        : "Added to backlog — will be implemented locally.";
      await sendWebhookFollowup(webhookUrl, { content: confirmMsg });

      // Update embed
      const feedbackChannelId = await findChannelByName(CHANNELS.PIPELINE);
      if (existing.discord_message_id && feedbackChannelId) {
        const typeEmoji: Record<string, string> = { bug: "🐛", wish: "⭐", feedback: "💬", question: "❓" };
        await editMessage(feedbackChannelId, existing.discord_message_id, {
          embeds: [{
            title: `${typeEmoji[existing.type] || "💬"} ${existing.type} — 📋 Backlogged`,
            description: (notes ? `${existing.body}\n\n---\nNotes: ${notes}` : existing.body).slice(0, 2000),
            color: 0x3498db, // blue
            footer: { text: `ID: ${feedbackId.slice(0, 8)} | For local implementation` },
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
        pipeline_status: "rejected",
        completed_at: new Date().toISOString(),
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
      const declineChannelId = await findChannelByName(CHANNELS.PIPELINE);
      if (existing.discord_message_id && declineChannelId) {
        const typeEmoji: Record<string, string> = { bug: "🐛", wish: "⭐", feedback: "💬", question: "❓" };
        await editMessage(declineChannelId, existing.discord_message_id, {
          embeds: [{
            title: `${typeEmoji[existing.type] || "💬"} ${existing.type} — 🚫 Declined`,
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
  if (!discordUserId) return null;

  const { data } = await platform(supabase)
    .from("user_preferences")
    .select("user_id")
    .eq("preference_key", "discord_user_id")
    .eq("preference_value", JSON.stringify(discordUserId))
    .maybeSingle();

  return data?.user_id || null;
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

// Split long text for Discord's 2000-char limit
function splitForDiscord(content: string, maxLength: number): string[] {
  if (content.length <= maxLength) return [content];

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Prefer splitting at paragraph breaks, then newlines, then spaces
    let splitAt = remaining.lastIndexOf("\n\n", maxLength);
    if (splitAt === -1 || splitAt < maxLength / 3) {
      splitAt = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitAt === -1 || splitAt < maxLength / 3) {
      splitAt = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitAt === -1 || splitAt < maxLength / 3) {
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

// Ensure messages alternate user/assistant correctly
function ensureAlternation(messages: { role: "user" | "assistant"; content: string }[]) {
  if (messages.length === 0) return messages;

  const result: { role: "user" | "assistant"; content: string }[] = [];
  for (const msg of messages) {
    if (result.length === 0) {
      result.push(msg);
    } else if (result[result.length - 1].role === msg.role) {
      // Merge consecutive same-role messages
      result[result.length - 1].content += "\n" + msg.content;
    } else {
      result.push(msg);
    }
  }

  // Ensure first message is from user
  if (result.length > 0 && result[0].role !== "user") {
    result.unshift({ role: "user", content: "(conversation resumed)" });
  }

  return result;
}

async function logToChannel(summary: string) {
  try {
    const channels = await getGuildChannels();
    const logsChannel = channels.find((c) => c.name === CHANNELS.PIPELINE);
    if (logsChannel) {
      await sendMessage(logsChannel.id, `\`${new Date().toISOString().slice(11, 19)}\` ${summary}`);
    }
  } catch {
    // Non-critical
  }
}

export { runAgent, resolveUser };
