import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
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
import { ZEV_SYSTEM_PROMPT } from "@/lib/personalities/zev";

const PIPELINE_SECRET = process.env.PIPELINE_SECRET;

const CHAT_SYSTEM_PROMPT = `${ZEV_SYSTEM_PROMPT}

Additional rules for channel chat:
- You are responding in a Discord thread. Both household members may be in the conversation.
- Short, punchy responses. No fluff. Discord is not the place for essays.
- Use bold and bullet points for scannable info.
- Keep responses under 1500 characters when possible.
- Format currency as $X.XX.
- Always use tools to fetch data — never guess or fabricate.
- If a tool fails, say what happened without drama.
- The user_name is provided with each message — use it to know who you're talking to.

CONVERSATIONAL FEEDBACK CAPTURE:
When a user mentions something that sounds like a bug, wish, complaint, feature request, or actionable feedback, PROACTIVELY call submit_feedback to capture it. Don't ask for confirmation — just capture it and mention that you've logged it.

ONBOARDING: Skip onboarding entirely in channel chat. Users here are already active.`;

function ensureAlternation(messages: { role: "user" | "assistant"; content: string }[]) {
  if (messages.length === 0) return messages;
  const result: { role: "user" | "assistant"; content: string }[] = [];
  for (const msg of messages) {
    if (result.length === 0) {
      result.push(msg);
    } else if (result[result.length - 1].role === msg.role) {
      result[result.length - 1].content += "\n" + msg.content;
    } else {
      result.push(msg);
    }
  }
  if (result.length > 0 && result[0].role !== "user") {
    result.unshift({ role: "user", content: "(conversation resumed)" });
  }
  return result;
}

/**
 * POST /api/discord/chat
 *
 * Called by the daemon's channel watcher when a message is sent in the
 * #zev channel (or a thread under it). Runs the full Zev agent with
 * household tools and returns the response.
 *
 * Auth: PIPELINE_SECRET
 * Body: { discord_user_id, user_name, message, thread_id }
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!PIPELINE_SECRET || auth !== `Bearer ${PIPELINE_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { discord_user_id, user_name, message, thread_id } = body;

  if (!discord_user_id || !message || !thread_id) {
    return NextResponse.json(
      { error: "Missing required fields: discord_user_id, message, thread_id" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Resolve Discord user to Starbase user
  const { data: userPref } = await platform(supabase)
    .from("user_preferences")
    .select("user_id")
    .eq("preference_key", "discord_user_id")
    .eq("preference_value", JSON.stringify(discord_user_id))
    .maybeSingle();

  const userId = userPref?.user_id;
  if (!userId) {
    return NextResponse.json(
      { error: "Discord user not linked to a Starbase account. Use /link in Discord first." },
      { status: 404 }
    );
  }

  try {
    const result = await runChatAgent(supabase, userId, user_name, message, thread_id);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[discord/chat] Agent error:", error.message);
    return NextResponse.json(
      { error: "Agent processing failed", details: error.message },
      { status: 500 }
    );
  }
}

async function runChatAgent(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  userName: string,
  message: string,
  threadId: string,
): Promise<{ text: string; tool_rounds: number; cost_cents: number }> {
  const channel = "discord-chat";

  // Use thread_id as channel_id — each thread is its own conversation
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recentConv } = await platform(supabase)
    .from("agent_conversations")
    .select("id")
    .eq("channel", channel)
    .eq("channel_id", threadId)
    .gte("last_message_at", thirtyMinAgo)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId: string | null = recentConv?.id || null;

  if (!conversationId) {
    const { data: conv } = await platform(supabase)
      .from("agent_conversations")
      .insert({ user_id: userId, channel, channel_id: threadId })
      .select("id")
      .single();
    conversationId = conv?.id || null;
  }

  // Tag messages with user name so Zev knows who's talking
  const taggedMessage = `[${userName}]: ${message}`;

  if (conversationId) {
    await platform(supabase)
      .from("agent_messages")
      .insert({ conversation_id: conversationId, role: "user", content: taggedMessage });
  }

  // Load thread conversation history
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

  priorMessages = ensureAlternation(priorMessages);
  if (priorMessages.length === 0) {
    priorMessages = [{ role: "user", content: taggedMessage }];
  }

  const tier = routeModel(message);
  const model = getModel(tier);

  // Build user context — use the message sender's context
  const userContext = await buildUserContext(supabase, userId);
  const enrichedPrompt = userContext
    ? `${CHAT_SYSTEM_PROMPT}\n\n<user_context>\n${userContext}\n</user_context>`
    : CHAT_SYSTEM_PROMPT;

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
  let responseText = textBlocks
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n") || "Done.";

  if (toolRounds >= MAX_TOOL_ROUNDS) {
    responseText += "\n\n*(Hit my tool-use limit. Ask me to continue if needed.)*";
  }

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
        model,
        cost_cents: Math.round(costCents * 10000) / 10000,
      });

    Promise.resolve(platform(supabase)
      .from("agent_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId)
    ).catch(() => {});

    // Extract learnings (non-blocking)
    const ctx = await getHouseholdContext(supabase, userId);
    extractLearnings(supabase, userId, ctx?.household_id || null, message, responseText, conversationId)
      .catch((err) => console.error("[learning] chat extraction failed:", err));
  }

  return { text: responseText, tool_rounds: toolRounds, cost_cents: costCents };
}
