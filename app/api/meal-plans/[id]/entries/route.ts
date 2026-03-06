import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { household } from "@/lib/supabase/schemas";

// POST /api/meal-plans/[id]/entries — Add an entry to a meal plan
export const POST = withAuth(async (request: NextRequest, { supabase }, params) => {
  const planId = params.id;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { recipe_id, day_of_week, meal_type, label, servings_override } = body;

  if (day_of_week === undefined || typeof day_of_week !== "number" || day_of_week < 0 || day_of_week > 6) {
    return NextResponse.json({ error: "day_of_week must be 0-6" }, { status: 400 });
  }

  const validMealTypes = ["breakfast", "lunch", "dinner", "snack"];
  if (!meal_type || !validMealTypes.includes(meal_type)) {
    return NextResponse.json({ error: "meal_type must be breakfast, lunch, dinner, or snack" }, { status: 400 });
  }

  if (!recipe_id && !label) {
    return NextResponse.json({ error: "Either recipe_id or label is required" }, { status: 400 });
  }

  // Verify plan exists
  const { data: plan } = await household(supabase)
    .from("meal_plans")
    .select("id")
    .eq("id", planId)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "Meal plan not found" }, { status: 404 });
  }

  const { data: entry, error } = await household(supabase)
    .from("meal_plan_entries")
    .insert({
      meal_plan_id: planId,
      recipe_id: recipe_id || null,
      day_of_week,
      meal_type,
      label: label?.trim() || null,
      servings_override: servings_override || null,
    })
    .select("*, recipe:recipes(id, title, servings, tags)")
    .single();

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ entry }, { status: 201 });
});

// DELETE /api/meal-plans/[id]/entries — Delete an entry
export const DELETE = withAuth(async (request: NextRequest, { supabase }, params) => {
  const planId = params.id;
  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get("entry_id");

  if (!entryId) {
    return NextResponse.json({ error: "entry_id query param required" }, { status: 400 });
  }

  const { error } = await household(supabase)
    .from("meal_plan_entries")
    .delete()
    .eq("id", entryId)
    .eq("meal_plan_id", planId);

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
