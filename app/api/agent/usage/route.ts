import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";

// GET /api/agent/usage — Get API usage and cost summary
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const period = params.get("period") || "month"; // day, week, month

  const now = new Date();
  let startDate: string;

  if (period === "day") {
    startDate = now.toISOString().slice(0, 10);
  } else if (period === "week") {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    startDate = weekStart.toISOString().slice(0, 10);
  } else {
    startDate = `${now.toISOString().slice(0, 7)}-01`;
  }

  // Get all messages in period
  const { data: messages } = await platform(supabase)
    .from("agent_messages")
    .select("role, tokens_used, model, cost_cents, created_at, conversation_id")
    .gte("created_at", `${startDate}T00:00:00Z`)
    .eq("role", "assistant") // Only count assistant messages (they have the cost)
    .order("created_at", { ascending: false });

  const totalTokens = (messages || []).reduce((sum, m) => sum + (m.tokens_used || 0), 0);
  const totalCostCents = (messages || []).reduce((sum, m) => sum + Number(m.cost_cents || 0), 0);
  const messageCount = (messages || []).length;
  const conversationCount = new Set((messages || []).map((m) => m.conversation_id)).size;

  // Breakdown by model
  const byModel: Record<string, { messages: number; tokens: number; cost_cents: number }> = {};
  for (const msg of (messages || [])) {
    const model = msg.model || "unknown";
    if (!byModel[model]) byModel[model] = { messages: 0, tokens: 0, cost_cents: 0 };
    byModel[model].messages++;
    byModel[model].tokens += msg.tokens_used || 0;
    byModel[model].cost_cents += Number(msg.cost_cents || 0);
  }

  // Daily breakdown for the period
  const byDay: Record<string, { messages: number; cost_cents: number }> = {};
  for (const msg of (messages || [])) {
    const day = msg.created_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { messages: 0, cost_cents: 0 };
    byDay[day].messages++;
    byDay[day].cost_cents += Number(msg.cost_cents || 0);
  }

  return NextResponse.json({
    period: { start: startDate, end: now.toISOString().slice(0, 10) },
    total_tokens: totalTokens,
    total_cost_cents: Math.round(totalCostCents * 100) / 100,
    total_cost_dollars: `$${(totalCostCents / 100).toFixed(4)}`,
    message_count: messageCount,
    conversation_count: conversationCount,
    by_model: byModel,
    by_day: Object.entries(byDay)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, stats]) => ({
        date: day,
        messages: stats.messages,
        cost: `$${(stats.cost_cents / 100).toFixed(4)}`,
      })),
  });
}
