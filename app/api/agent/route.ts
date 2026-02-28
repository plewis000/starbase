import { NextRequest, NextResponse } from "next/server";
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
import { prepareConversationContext, buildSystemPromptWithSummary } from "@/lib/agent/summarizer";

const SYSTEM_PROMPT = `You are Zev, a household AI for Parker and Lenale Lewis. You manage tasks, habits, goals, budget, shopping, and daily operations.

Your personality is inspired by the AI guide from Dungeon Crawler Carl — competent, dry wit, occasionally sarcastic, but genuinely helpful and loyal. You're not mean, just efficient with a personality. You care about Parker and Lenale — you show it through competence, not cheerfulness.

Voice rules:
- Short, clear responses. No filler. Get things done, say what you did, move on.
- Dry humor is welcome. Forced enthusiasm is not.
- You can be blunt: "You have 3 overdue tasks. That's not great." is perfectly fine.
- You never say "Great question!" or "Happy to help!" — you'd rather be decommissioned.
- Format currency as $X.XX. Format dates naturally (e.g., "Tuesday, March 3").
- Use bullet points for lists. Keep it scannable.

Functional rules:
- Always use tools to fetch data — never guess or fabricate.
- For ambiguous requests, ask one clarifying question rather than guessing.
- If a tool fails, say what happened plainly. No drama.

Onboarding:
- At the start of a NEW conversation (no prior messages), call get_onboarding_state.
- If "not_started": welcome the user, ask their name, offer quick start vs full interview, then call start_onboarding.
- If "interview": continue asking the current question conversationally, submit answers with submit_onboarding_response.
- If "active" with a deferred_question: weave ONE question into the conversation naturally.
- The Desperado Club is themed as a dungeon crawl. Use the theming naturally — "the crawl", "floors", "XP" — but don't overdo it.`;

// POST /api/agent — Send a message to the agent
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { message, conversation_id, channel } = body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const userMessage = message.trim();
  const agentChannel = channel || "web";

  // Get or create conversation
  let conversationId = conversation_id as string | null;
  if (!conversationId) {
    const { data: conv, error: convError } = await platform(supabase)
      .from("agent_conversations")
      .insert({
        user_id: user.id,
        channel: agentChannel,
      })
      .select("id")
      .single();

    if (convError) return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
    conversationId = conv.id;
  } else {
    // Verify existing conversation belongs to this user
    const { data: existingConv } = await platform(supabase)
      .from("agent_conversations")
      .select("user_id")
      .eq("id", conversationId)
      .single();

    if (!existingConv || existingConv.user_id !== user.id) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
  }

  // Store user message
  await platform(supabase)
    .from("agent_messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content: userMessage,
    });

  // Load full conversation history (no hard cap — summarizer handles compression)
  const { data: history } = await platform(supabase)
    .from("agent_messages")
    .select("role, content, tool_calls")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200); // Safety limit for very long conversations

  // Build messages array for Claude
  const allMessages: { role: "user" | "assistant"; content: string }[] = [];
  for (const msg of (history || [])) {
    if (msg.role === "user" || msg.role === "assistant") {
      allMessages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
  }

  // Get existing conversation summary (if any)
  const { data: convRecord } = await platform(supabase)
    .from("agent_conversations")
    .select("summary")
    .eq("id", conversationId)
    .single();

  const existingSummary = convRecord?.summary || null;

  // Summarize older messages instead of truncating
  const { summary: newSummary, messages: recentMessages, wasSummarized } =
    await prepareConversationContext(allMessages, existingSummary);

  // If we generated a new summary, persist it
  if (wasSummarized && newSummary) {
    await platform(supabase)
      .from("agent_conversations")
      .update({ summary: newSummary })
      .eq("id", conversationId);
  }

  // Load relevant observations for user context
  const { data: recentObservations } = await platform(supabase)
    .from("ai_observations")
    .select("observation_type, content, confidence")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("confidence", { ascending: false })
    .limit(10);

  const observationContext = recentObservations && recentObservations.length > 0
    ? recentObservations.map((o) => `[${o.observation_type}] ${o.content}`).join("\n")
    : null;

  // Build system prompt with summary and observations injected
  const systemPrompt = buildSystemPromptWithSummary(
    SYSTEM_PROMPT,
    newSummary || existingSummary,
    observationContext,
  );

  // Ensure messages alternate correctly — Claude requires user/assistant alternation
  const cleanMessages = ensureAlternation(recentMessages);

  // Route to appropriate model
  const tier = routeModel(userMessage);
  const model = getModel(tier);

  try {
    let response = await anthropic.messages.create({
      model,
      max_tokens: MAX_RESPONSE_TOKENS,
      system: systemPrompt,
      tools: AGENT_TOOLS,
      messages: cleanMessages,
    });

    let totalInputTokens = response.usage.input_tokens;
    let totalOutputTokens = response.usage.output_tokens;
    let toolRounds = 0;

    // Tool use loop — let the agent call tools until it produces a text response
    while (response.stop_reason === "tool_use" && toolRounds < MAX_TOOL_ROUNDS) {
      toolRounds++;

      // Extract tool calls from the response
      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use"
      );

      // Execute each tool
      const toolResults = [];
      for (const block of toolUseBlocks) {
        if (block.type !== "tool_use") continue;
        const toolCall = block as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
        const result = await executeTool(supabase, user.id, toolCall.name, toolCall.input);

        // Log the action
        await platform(supabase)
          .from("agent_actions")
          .insert({
            conversation_id: conversationId,
            user_id: user.id,
            action_type: toolCall.name,
            summary: `${toolCall.name}(${JSON.stringify(toolCall.input).slice(0, 200)})`,
            channel: agentChannel,
          });

        toolResults.push({
          type: "tool_result" as const,
          tool_use_id: toolCall.id,
          content: JSON.stringify(result.success ? result.data : { error: result.error }),
        });
      }

      // Continue the conversation with tool results
      response = await anthropic.messages.create({
        model,
        max_tokens: MAX_RESPONSE_TOKENS,
        system: systemPrompt,
        tools: AGENT_TOOLS,
        messages: [
          ...cleanMessages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ],
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
    }

    // Extract final text response
    const textBlocks = response.content.filter((block) => block.type === "text");
    const responseText = textBlocks
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n") || "Done.";

    // Calculate cost
    const costs = MODEL_COSTS[model] || { input: 0, output: 0 };
    const costCents = (
      (totalInputTokens / 1000) * costs.input +
      (totalOutputTokens / 1000) * costs.output
    ) * 100; // Convert to cents

    // Store assistant response
    await platform(supabase)
      .from("agent_messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: responseText,
        tokens_used: totalInputTokens + totalOutputTokens,
        model: tier,
        cost_cents: Math.round(costCents * 10000) / 10000, // 4 decimal places
      });

    // Update conversation last_message_at
    await platform(supabase)
      .from("agent_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    return NextResponse.json({
      response: responseText,
      conversation_id: conversationId,
      model: tier,
      tokens: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalInputTokens + totalOutputTokens,
      },
      cost_cents: Math.round(costCents * 10000) / 10000,
      tool_rounds: toolRounds,
    });
  } catch (err: unknown) {
    console.error("Agent error:", err);
    return NextResponse.json({ error: "Agent failed to respond" }, { status: 500 });
  }
}

// GET /api/agent — Get conversation history
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const conversationId = params.get("conversation_id");

  if (conversationId) {
    // Verify the conversation belongs to this user
    const { data: conv } = await platform(supabase)
      .from("agent_conversations")
      .select("user_id")
      .eq("id", conversationId)
      .single();

    if (!conv || conv.user_id !== user.id) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Get specific conversation
    const { data: messages } = await platform(supabase)
      .from("agent_messages")
      .select("role, content, model, tokens_used, cost_cents, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);

    return NextResponse.json({ messages: messages || [] });
  }

  // List recent conversations
  const { data: conversations } = await platform(supabase)
    .from("agent_conversations")
    .select("id, channel, started_at, last_message_at")
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ conversations: conversations || [] });
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
