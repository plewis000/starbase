import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { isValidUUID } from "@/lib/validation";
import { getHouseholdContext, getHouseholdMemberIds } from "@/lib/household";

// GET /api/gamification/party-goals — List household's party goals with progress
export const GET = withUser(async (_request, { supabase, user }) => {
  // Scope to household members' goals
  const ctx = await getHouseholdContext(supabase, user.id);
  const memberIds = ctx
    ? await getHouseholdMemberIds(supabase, ctx.household_id)
    : [user.id];

  // Get household goals first
  const { data: goals } = await platform(supabase)
    .from("goals")
    .select("id")
    .in("owner_id", memberIds);
  const goalIds = (goals || []).map(g => g.id);

  if (goalIds.length === 0) {
    return NextResponse.json({ partyGoals: [] });
  }

  const { data: partyGoals, error } = await platform(supabase)
    .from("party_goals")
    .select(`
      id,
      party_xp_bonus,
      created_at,
      goal:goals(id, title, description, status, progress_value, target_date, created_at)
    `)
    .eq("is_party_goal", true)
    .in("goal_id", goalIds);

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  return NextResponse.json({ partyGoals: partyGoals || [] });
});

// POST /api/gamification/party-goals — Mark a goal as a party goal
export const POST = withUser(async (request: NextRequest, { supabase }) => {
  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { goal_id, party_xp_bonus } = body;

  if (!goal_id || !isValidUUID(goal_id)) {
    return NextResponse.json({ error: "goal_id must be a valid UUID" }, { status: 400 });
  }
  const xpBonus = typeof party_xp_bonus === "number" && party_xp_bonus >= 0 && party_xp_bonus <= 10000
    ? party_xp_bonus : 100;

  const { data, error } = await platform(supabase)
    .from("party_goals")
    .upsert({
      goal_id,
      is_party_goal: true,
      party_xp_bonus: xpBonus,
    }, { onConflict: "goal_id" })
    .select("*")
    .single();

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  return NextResponse.json({ partyGoal: data }, { status: 201 });
});

// DELETE /api/gamification/party-goals — Remove party status from a goal
export const DELETE = withUser(async (request: NextRequest, { supabase }) => {
  const goalId = request.nextUrl.searchParams.get("goal_id");
  if (!goalId || !isValidUUID(goalId)) return NextResponse.json({ error: "goal_id must be a valid UUID" }, { status: 400 });

  const { error } = await platform(supabase)
    .from("party_goals")
    .delete()
    .eq("goal_id", goalId);

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  return NextResponse.json({ success: true });
});
