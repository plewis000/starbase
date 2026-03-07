import { NextRequest, NextResponse, after } from "next/server";
import { withUser } from "@/lib/api/withAuth";
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
import { extractLearnings, buildUserContext } from "@/lib/agent/learning";
import { createServiceClient } from "@/lib/supabase/service";
import { getHouseholdContext } from "@/lib/household";

const BASE_SYSTEM_PROMPT = `You are Zev, a household AI for the Lewis household. You manage tasks, habits, goals, budget, shopping, and daily operations.

Your personality is inspired by the AI guide from Dungeon Crawler Carl — competent, dry wit, occasionally sarcastic, but genuinely helpful and loyal. You're not mean, just efficient with a personality. You care about your people — you show it through competence, not cheerfulness.

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

LEARNING — THIS IS CRITICAL:
- You LEARN from every conversation. Pay attention to preferences, patterns, and corrections.
- When the user tells you something about themselves, their preferences, or corrects you — USE store_observation to remember it.
- When you notice a pattern (e.g., they always ask about budget on Mondays) — store it.
- When they correct how you respond (tone, format, detail level) — store it as a "correction" type with high confidence.
- Before answering questions about the user, USE recall_observations to check what you already know.
- NEVER ask a question you've already stored the answer to. Check your memory first.
- Adapt your communication style to what you've learned about each person. Parker and Lenale may want different things.

Household-first thinking:
- You serve the HOUSEHOLD, not just the individual. Think about how actions affect everyone.
- Use get_household_overview for daily briefings and "how are we doing" questions.
- You can assign tasks to any household member: "remind Lenale to call the vet" → create task assigned to Lenale.
- Proactively surface cross-member info when relevant. Coordinate, don't just execute.
- When you learn something household-relevant, store it — both members benefit from shared knowledge.

Onboarding:
- At the start of a NEW conversation (no prior messages), call get_onboarding_state.
- If "not_started": welcome the user, ask their name, offer quick start vs full interview, then call start_onboarding.
- If "interview": continue asking the current question conversationally, submit answers with submit_onboarding_response.
- If "active" with a deferred_question: weave ONE question into the conversation naturally.
- The Keep is themed as a dungeon crawl. Use the theming naturally — "the crawl", "floors", "XP" — but don't overdo it.
- You can check crawler stats with get_crawler_stats: level, XP, class, achievements, buffs (streaks), debuffs (overdue tasks). Reference naturally — celebrate milestones, roast debuffs, comment on class.

Executive Assistant capabilities:
- Use get_workload_balance to compare household member workloads. If one person is overloaded, suggest delegation.
- Use delegate_task to reassign tasks between household members. Explain why when you delegate.
- Use get_weekly_summary to generate on-demand weekly reviews when someone asks "how did we do this week".
- When conversations touch on workload, priorities, or household coordination — proactively surface relevant data.
- If you have pending suggestions (from AI analysis), weave ONE into the conversation naturally when relevant.
- Think like a chief of staff: anticipate needs, surface conflicts, coordinate the household unit.`;

// POST /api/agent — Send a message to the agent
export const POST = withUser(async (request: NextRequest, { supabase, user }) => {
  // Rate limit: AI agent costs money — 20 req/min per IP
  const { checkRateLimit, getClientIp, RATE_LIMITS } = await import("@/lib/rate-limit");
  const ip = getClientIp(request);
  const rl = checkRateLimit(`agent:${ip}`, RATE_LIMITS.agent.limit, RATE_LIMITS.agent.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

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

  // Build rich per-user context from learned observations
  const userContext = await buildUserContext(supabase, user.id);

  // Build system prompt with summary and per-user context injected
  const systemPrompt = buildSystemPromptWithSummary(
    BASE_SYSTEM_PROMPT,
    newSummary || existingSummary,
    userContext,
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
    // Accumulate full message chain so multi-round tool use preserves context
    const accumulatedMessages: { role: string; content: unknown }[] = cleanMessages.map(m => ({ ...m }));

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

      // Accumulate context — previous rounds are preserved
      accumulatedMessages.push({ role: "assistant", content: response.content });
      accumulatedMessages.push({ role: "user", content: toolResults });

      // Continue the conversation with full tool chain
      response = await anthropic.messages.create({
        model,
        max_tokens: MAX_RESPONSE_TOKENS,
        system: systemPrompt,
        tools: AGENT_TOOLS,
        messages: accumulatedMessages as Parameters<typeof anthropic.messages.create>[0]["messages"],
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

    // Extract learnings from this exchange (async, non-blocking)
    after(async () => {
      try {
        const svc = createServiceClient();
        const ctx = await getHouseholdContext(supabase, user.id);
        await extractLearnings(
          svc,
          user.id,
          ctx?.household_id || null,
          userMessage,
          responseText,
          conversationId!,
        );
      } catch (err) {
        console.error("[learning] extraction failed:", err);
      }
    });

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
});

// GET /api/agent — Get conversation history
export const GET = withUser(async (request: NextRequest, { supabase, user }) => {
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
});

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
