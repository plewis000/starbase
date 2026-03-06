import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { household } from "@/lib/supabase/schemas";

// GET /api/meal-plans — List meal plans (optionally filter by week)
export const GET = withAuth(async (request: NextRequest, { supabase }) => {
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("week_start");

  let query = household(supabase)
    .from("meal_plans")
    .select("*, entries:meal_plan_entries(*, recipe:recipes(id, title, servings, prep_time_minutes, cook_time_minutes, tags))")
    .order("week_start", { ascending: false })
    .limit(10);

  if (weekStart) {
    query = query.eq("week_start", weekStart);
  }

  const { data: plans, error } = await query;

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ meal_plans: plans || [] });
});

// POST /api/meal-plans — Create a meal plan for a given week
export const POST = withAuth(async (request: NextRequest, { supabase, user }) => {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { week_start } = body;

  if (!week_start || typeof week_start !== "string") {
    return NextResponse.json({ error: "week_start (YYYY-MM-DD) is required" }, { status: 400 });
  }

  // Check if a plan already exists for this week
  const { data: existing } = await household(supabase)
    .from("meal_plans")
    .select("id")
    .eq("week_start", week_start)
    .single();

  if (existing) {
    return NextResponse.json({ error: "A meal plan already exists for this week", existing_id: existing.id }, { status: 409 });
  }

  const { data: plan, error } = await household(supabase)
    .from("meal_plans")
    .insert({
      week_start,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ meal_plan: plan }, { status: 201 });
});
