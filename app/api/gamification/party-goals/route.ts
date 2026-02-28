import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";

// GET /api/gamification/party-goals — List all party goals with progress
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: partyGoals, error } = await platform(supabase)
    .from("party_goals")
    .select(`
      id,
      party_xp_bonus,
      created_at,
      goal:goals(id, title, description, status, progress_pct, target_date, created_at)
    `)
    .eq("is_party_goal", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ partyGoals: partyGoals || [] });
}

// POST /api/gamification/party-goals — Mark a goal as a party goal
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { goal_id, party_xp_bonus } = body;

  if (!goal_id) {
    return NextResponse.json({ error: "goal_id is required" }, { status: 400 });
  }

  const { data, error } = await platform(supabase)
    .from("party_goals")
    .upsert({
      goal_id,
      is_party_goal: true,
      party_xp_bonus: party_xp_bonus || 100,
    }, { onConflict: "goal_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ partyGoal: data }, { status: 201 });
}

// DELETE /api/gamification/party-goals — Remove party status from a goal
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const goalId = request.nextUrl.searchParams.get("goal_id");
  if (!goalId) return NextResponse.json({ error: "goal_id required" }, { status: 400 });

  const { error } = await platform(supabase)
    .from("party_goals")
    .delete()
    .eq("goal_id", goalId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
