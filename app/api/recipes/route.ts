import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { household } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";
import { sanitizeSearchInput } from "@/lib/validation";

// GET /api/recipes — List all recipes
export const GET = withAuth(async (request: NextRequest, { supabase }) => {
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get("tag");
  const search = searchParams.get("q");

  let query = household(supabase)
    .from("recipes")
    .select("id, title, source_url, servings, prep_time_minutes, cook_time_minutes, tags, created_by, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (tag) {
    query = query.contains("tags", [tag]);
  }

  if (search) {
    const sanitized = sanitizeSearchInput(search);
    query = query.ilike("title", `%${sanitized}%`);
  }

  const { data: recipes, error } = await query;

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ recipes: recipes || [] });
});

// POST /api/recipes — Create a new recipe with ingredients
export const POST = withAuth(async (request: NextRequest, { supabase, user }) => {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { title, source_url, servings, prep_time_minutes, cook_time_minutes, instructions, tags, notes, ingredients } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // Insert recipe
  const { data: recipe, error } = await household(supabase)
    .from("recipes")
    .insert({
      title: title.trim(),
      source_url: source_url?.trim() || null,
      servings: servings || 4,
      prep_time_minutes: prep_time_minutes || null,
      cook_time_minutes: cook_time_minutes || null,
      instructions: instructions?.trim() || null,
      tags: Array.isArray(tags) ? tags : [],
      notes: notes?.trim() || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Insert ingredients if provided
  if (Array.isArray(ingredients) && ingredients.length > 0) {
    const ingredientRows = ingredients.map((ing: Record<string, unknown>, idx: number) => ({
      recipe_id: recipe.id,
      name: typeof ing.name === "string" ? ing.name.trim() : "",
      quantity: typeof ing.quantity === "string" ? ing.quantity.trim() || null : null,
      category_id: ing.category_id || null,
      is_optional: ing.is_optional || false,
      sort_order: idx,
    })).filter((r: { name: string }) => r.name);

    if (ingredientRows.length > 0) {
      const { error: ingError } = await household(supabase)
        .from("recipe_ingredients")
        .insert(ingredientRows);

      if (ingError) {
        console.error("Ingredient insert error:", ingError.message);
      }
    }
  }

  // Fetch back with ingredients
  const { data: full } = await household(supabase)
    .from("recipes")
    .select("*, ingredients:recipe_ingredients(*)")
    .eq("id", recipe.id)
    .single();

  await logActivity(supabase, {
    entity_type: "recipe",
    entity_id: recipe.id,
    action: "created",
    performed_by: user.id,
    metadata: { title: recipe.title },
  }).catch(console.error);

  return NextResponse.json({ recipe: full }, { status: 201 });
});
