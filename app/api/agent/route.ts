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
  MAX_CONVERSATION_MESSAGES,
} from "@/lib/agent/client";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { executeTool } from "@/lib/agent/executor";

const SYSTEM_PROMPT = `You are Starbase, a personal household assistant for Parker and Lenale Lewis. You help manage tasks, habits, goals, budget, shopping, and daily operations.

Personality: competent, brief, occasionally warm. Not overly chatty. Get things done, confirm what you did, move on.

Rules:
- Always use tools to fetch data — never guess or make up information.
- When the user asks about spending, budget, or finances, use the finance tools.
- When the user asks about tasks, check the task tools.
- For ambiguous requests, ask a clarifying question rather than guessing.
- Format currency as $X.XX. Format dates naturally (e.g., "Tuesday, March 3").
- Keep responses concise. Use bullet points for lists.
- If a tool fails, tell the user what happened and suggest an alternative.`;

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
  }

  // Store user message
  await platform(supabase)
    .from("agent_messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content: userMessage,
    });

  // Load conversation history (capped)
  const { data: history } = await platform(supabase)
    .from("agent_messages")
    .select("role, content, tool_calls")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(MAX_CONVERSATION_MESSAGES);

  // Build messages array for Claude
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const msg of (history || [])) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
  }

  // Ensure messages alternate correctly — Claude requires user/assistant alternation
  const cleanMessages = ensureAlternation(messages);

  // Route to appropriate model
  const tier = routeModel(userMessage);
  const model = getModel(tier);

  try {
    let response = await anthropic.messages.create({
      model,
      max_tokens: MAX_RESPONSE_TOKENS,
      system: SYSTEM_PROMPT,
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
        system: SYSTEM_PROMPT,
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
