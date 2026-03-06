import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { household } from "@/lib/supabase/schemas";

// GET /api/meal-plans/[id] — Get a meal plan with entries and recipes
export const GET = withAuth(async (_request, { supabase }, params) => {
  const planId = params.id;

  const { data: plan, error } = await household(supabase)
    .from("meal_plans")
    .select("*, entries:meal_plan_entries(*, recipe:recipes(id, title, servings, prep_time_minutes, cook_time_minutes, tags))")
    .eq("id", planId)
    .single();

  if (error || !plan) {
    return NextResponse.json({ error: "Meal plan not found" }, { status: 404 });
  }

  return NextResponse.json({ meal_plan: plan });
});

// DELETE /api/meal-plans/[id] — Delete a meal plan
export const DELETE = withAuth(async (_request, { supabase }, params) => {
  const planId = params.id;

  const { error } = await household(supabase)
    .from("meal_plans")
    .delete()
    .eq("id", planId);

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
