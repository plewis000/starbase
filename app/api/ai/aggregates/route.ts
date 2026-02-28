// ============================================================
// FILE: app/api/ai/aggregates/route.ts
// PURPOSE: Behavioral aggregates — compute and retrieve daily metrics
//          Called by cron job or manually. Agent uses this for patterns.
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { validatePagination } from "@/lib/validation";

// GET /api/ai/aggregates — get behavioral aggregates for current user
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const days = Math.min(Math.max(parseInt(params.get("days") || "7") || 7, 1), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { limit, offset } = validatePagination(params.get("limit"), params.get("offset"));

  const { data: aggregates, error, count } = await platform(supabase)
    .from("behavioral_aggregates")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ aggregates: aggregates || [], total: count || 0 });
}

// POST /api/ai/aggregates — trigger computation for today (or a specific date)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const targetDate = body.date || new Date().toISOString().slice(0, 10);

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD format" }, { status: 400 });
  }

  // Call the database function to compute aggregates
  const { error: rpcError } = await supabase.rpc("compute_daily_aggregate", {
    p_user_id: user.id,
    p_date: targetDate,
  });

  if (rpcError) {
    // Fallback: compute in application code if RPC not available
    return await computeAggregateInApp(supabase, user.id, targetDate);
  }

  // Fetch the computed aggregate
  const { data: aggregate } = await platform(supabase)
    .from("behavioral_aggregates")
    .select("*")
    .eq("user_id", user.id)
    .eq("date", targetDate)
    .single();

  return NextResponse.json({
    aggregate,
    message: `Behavioral aggregate computed for ${targetDate}`,
  });
}

// Fallback computation when RPC function isn't deployed yet
async function computeAggregateInApp(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  date: string,
) {
  const nextDate = new Date(date + "T00:00:00Z");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  // Tasks created today
  const { count: tasksCreated } = await platform(supabase)
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId)
    .gte("created_at", date)
    .lt("created_at", nextDateStr);

  // Tasks completed today
  const { count: tasksCompleted } = await platform(supabase)
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", userId)
    .gte("completed_at", date)
    .lt("completed_at", nextDateStr);

  // Habits checked today
  const { count: habitsChecked } = await platform(supabase)
    .from("habit_check_ins")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("check_date", date);

  // Session count
  const { count: sessionCount } = await platform(supabase)
    .from("agent_conversations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("started_at", date)
    .lt("started_at", nextDateStr);

  // XP earned
  const { data: xpData } = await platform(supabase)
    .from("xp_ledger")
    .select("amount")
    .eq("user_id", userId)
    .gte("created_at", date)
    .lt("created_at", nextDateStr);

  const xpEarned = (xpData || []).reduce((s, x) => s + (x.amount || 0), 0);

  const aggregate = {
    user_id: userId,
    date,
    tasks_created: tasksCreated || 0,
    tasks_completed: tasksCompleted || 0,
    habits_checked: habitsChecked || 0,
    habits_missed: 0,
    xp_earned: xpEarned,
    session_count: sessionCount || 0,
  };

  // Upsert
  const { data: saved, error } = await platform(supabase)
    .from("behavioral_aggregates")
    .upsert(aggregate, { onConflict: "user_id,date" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    aggregate: saved,
    message: `Behavioral aggregate computed for ${date} (app fallback)`,
  });
}
