import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { household } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";

// GET /api/recipes/[id] — Get a single recipe with ingredients
export const GET = withAuth(async (_request, { supabase }, params) => {
  const recipeId = params.id;

  const { data: recipe, error } = await household(supabase)
    .from("recipes")
    .select("*, ingredients:recipe_ingredients(*)")
    .eq("id", recipeId)
    .single();

  if (error || !recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  // Sort ingredients by sort_order
  if (recipe.ingredients) {
    recipe.ingredients.sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);
  }

  return NextResponse.json({ recipe });
});

// PATCH /api/recipes/[id] — Update recipe
export const PATCH = withAuth(async (request: NextRequest, { supabase, user }, params) => {
  const recipeId = params.id;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // Verify recipe exists and belongs to user
  const { data: existing } = await household(supabase)
    .from("recipes")
    .select("id, created_by")
    .eq("id", recipeId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const { title, source_url, servings, prep_time_minutes, cook_time_minutes, instructions, tags, notes, ingredients } = body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (source_url !== undefined) updates.source_url = source_url?.trim() || null;
  if (servings !== undefined) updates.servings = servings;
  if (prep_time_minutes !== undefined) updates.prep_time_minutes = prep_time_minutes;
  if (cook_time_minutes !== undefined) updates.cook_time_minutes = cook_time_minutes;
  if (instructions !== undefined) updates.instructions = instructions?.trim() || null;
  if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];
  if (notes !== undefined) updates.notes = notes?.trim() || null;

  const { error } = await household(supabase)
    .from("recipes")
    .update(updates)
    .eq("id", recipeId);

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Replace ingredients if provided
  if (Array.isArray(ingredients)) {
    // Delete existing
    await household(supabase)
      .from("recipe_ingredients")
      .delete()
      .eq("recipe_id", recipeId);

    // Insert new
    if (ingredients.length > 0) {
      const rows = ingredients.map((ing: Record<string, unknown>, idx: number) => ({
        recipe_id: recipeId,
        name: typeof ing.name === "string" ? ing.name.trim() : "",
        quantity: typeof ing.quantity === "string" ? ing.quantity.trim() || null : null,
        category_id: ing.category_id || null,
        is_optional: ing.is_optional || false,
        sort_order: idx,
      })).filter((r: { name: string }) => r.name);

      if (rows.length > 0) {
        await household(supabase)
          .from("recipe_ingredients")
          .insert(rows);
      }
    }
  }

  // Fetch back
  const { data: updated } = await household(supabase)
    .from("recipes")
    .select("*, ingredients:recipe_ingredients(*)")
    .eq("id", recipeId)
    .single();

  await logActivity(supabase, {
    entity_type: "recipe",
    entity_id: recipeId,
    action: "updated",
    performed_by: user.id,
    metadata: { title: updated?.title },
  }).catch(console.error);

  return NextResponse.json({ recipe: updated });
});

// DELETE /api/recipes/[id] — Delete recipe
export const DELETE = withAuth(async (_request, { supabase, user }, params) => {
  const recipeId = params.id;

  const { data: existing } = await household(supabase)
    .from("recipes")
    .select("id, title")
    .eq("id", recipeId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  // CASCADE deletes ingredients
  const { error } = await household(supabase)
    .from("recipes")
    .delete()
    .eq("id", recipeId);

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "recipe",
    entity_id: recipeId,
    action: "deleted",
    performed_by: user.id,
    metadata: { title: existing.title },
  }).catch(console.error);

  return NextResponse.json({ success: true });
});
