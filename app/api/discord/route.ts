import { NextRequest, NextResponse } from "next/server";
import { verifyKey } from "discord-interactions";
import { sendMessage, sendEmbed, CHANNELS, getGuildChannels } from "@/lib/discord";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
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

const SYSTEM_PROMPT = `You are Starbase, a personal household assistant for Parker and Lenale Lewis, responding via Discord. Be concise — Discord messages should be short and scannable. Use bullet points and bold for key info. No walls of text.

Rules:
- Always use tools to fetch data — never guess.
- Keep responses under 1500 characters when possible.
- Format currency as $X.XX.
- For lists, use bullet points.
- If a tool fails, briefly say what happened.`;

// POST /api/discord — Discord Interactions endpoint
// Handles: ping verification, slash commands, and deferred responses
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-signature-ed25519") || "";
  const timestamp = request.headers.get("x-signature-timestamp") || "";

  // Verify the request is from Discord
  const isValid = await verifyKey(body, signature, timestamp, DISCORD_PUBLIC_KEY);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const interaction = JSON.parse(body);

  // Type 1: Ping (Discord verification)
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Type 2: Slash command
  if (interaction.type === 2) {
    const commandName = interaction.data.name;
    const options = parseOptions(interaction.data.options || []);
    const discordUserId = interaction.member?.user?.id || interaction.user?.id;

    // Respond with "thinking..." immediately, then process async
    // Type 5 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    const deferResponse = NextResponse.json({ type: 5 });

    // Process the command asynchronously
    processCommand(commandName, options, discordUserId, interaction).catch(console.error);

    return deferResponse;
  }

  return NextResponse.json({ type: 1 });
}

// Parse slash command options into a flat object
function parseOptions(options: { name: string; value: unknown }[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const opt of options) {
    result[opt.name] = opt.value;
  }
  return result;
}

// Process a slash command asynchronously and send the response via webhook
async function processCommand(
  commandName: string,
  options: Record<string, unknown>,
  discordUserId: string,
  interaction: { token: string; application_id: string; channel_id: string },
) {
  const APP_ID = process.env.DISCORD_APP_ID!;
  const webhookUrl = `https://discord.com/api/v10/webhooks/${APP_ID}/${interaction.token}`;

  try {
    // Map Discord user to Supabase user
    const supabase = await createClient();
    const userId = await resolveUser(supabase, discordUserId);

    if (!userId) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "I don't recognize your Discord account. Ask Parker to link it in Starbase settings.",
        }),
      });
      return;
    }

    let message: string;

    // Convert slash commands to natural language for the agent
    switch (commandName) {
      case "task":
        message = `Create a task: "${options.title}"${options.due ? ` due ${options.due}` : ""}${options.priority ? ` priority ${options.priority}` : ""}`;
        break;
      case "habit":
        message = `Check in to my habit "${options.name}"`;
        break;
      case "budget":
        message = `Show me my spending summary for ${options.period || "this month"}`;
        break;
      case "ask":
        message = options.message as string;
        break;
      case "shop":
        message = `Add these to my shopping list: ${options.items}`;
        break;
      case "dashboard":
        message = "Give me my daily dashboard overview";
        break;
      case "usage":
        message = "Show me my API usage and costs for this month";
        break;
      default:
        message = `${commandName} ${Object.values(options).join(" ")}`;
    }

    // Run through the agent
    const response = await runAgent(supabase, userId, message, "discord", interaction.channel_id);

    // Send response back via webhook
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: response.text }),
    });

    // Log to #logs channel if it exists
    if (response.toolRounds > 0) {
      await logToChannel(response.summary);
    }
  } catch (err) {
    console.error("Discord command error:", err);
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Something went wrong. Try again in a moment." }),
    });
  }
}

// Run the agent (shared logic between slash commands and channel messages)
async function runAgent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  message: string,
  channel: string,
  channelId: string,
): Promise<{ text: string; toolRounds: number; costCents: number; summary: string }> {
  // Create conversation
  const { data: conv } = await platform(supabase)
    .from("agent_conversations")
    .insert({ user_id: userId, channel, channel_id: channelId })
    .select("id")
    .single();

  const conversationId = conv?.id;

  // Store user message
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
    system: SYSTEM_PROMPT,
    tools: AGENT_TOOLS,
    messages: [{ role: "user", content: message }],
  });

  let totalInputTokens = response.usage.input_tokens;
  let totalOutputTokens = response.usage.output_tokens;
  let toolRounds = 0;
  const toolNames: string[] = [];

  // Tool loop
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
      system: SYSTEM_PROMPT,
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

  // Store assistant response
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

// Resolve Discord user ID to Supabase user ID
// For now, maps Parker's Discord ID. Can be expanded to a lookup table.
async function resolveUser(supabase: Awaited<ReturnType<typeof createClient>>, discordUserId: string): Promise<string | null> {
  // Check user_preferences for discord_user_id mapping
  const { data } = await platform(supabase)
    .from("user_preferences")
    .select("user_id")
    .eq("preference_key", "discord_user_id")
    .eq("preference_value", JSON.stringify(discordUserId))
    .single();

  if (data) return data.user_id;

  // Fallback: if only one user exists, use them (single-household mode)
  const { data: users } = await supabase.schema("platform")
    .from("users")
    .select("id")
    .limit(2);

  if (users && users.length === 1) return users[0].id;

  return null;
}

// Log agent actions to the #logs channel
async function logToChannel(summary: string) {
  try {
    const channels = await getGuildChannels();
    const logsChannel = channels.find((c) => c.name === CHANNELS.LOGS);
    if (logsChannel) {
      await sendMessage(logsChannel.id, `\`${new Date().toISOString().slice(11, 19)}\` ${summary}`);
    }
  } catch {
    // Non-critical — don't fail if logging fails
  }
}

export { runAgent, resolveUser };
