import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { household } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";

// POST /api/recipes/[id]/to-shopping — Convert recipe ingredients to shopping list items
export const POST = withAuth(async (request: NextRequest, { supabase, user }, params) => {
  const recipeId = params.id;
  let body;
  try { body = await request.json(); } catch { body = {}; }

  const { list_id, servings_multiplier } = body;

  // Get recipe with ingredients
  const { data: recipe } = await household(supabase)
    .from("recipes")
    .select("id, title, servings, ingredients:recipe_ingredients(*)")
    .eq("id", recipeId)
    .single();

  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const ingredients = recipe.ingredients || [];
  if (ingredients.length === 0) {
    return NextResponse.json({ error: "Recipe has no ingredients" }, { status: 400 });
  }

  // Find or create target shopping list
  let targetListId = list_id;
  if (!targetListId) {
    // Use default list or create one
    const { data: defaultList } = await household(supabase)
      .from("shopping_lists")
      .select("id")
      .eq("is_default", true)
      .limit(1)
      .single();

    if (defaultList) {
      targetListId = defaultList.id;
    } else {
      const { data: newList } = await household(supabase)
        .from("shopping_lists")
        .insert({
          name: "Grocery List",
          is_default: true,
          created_by: user.id,
          source: "recipe",
        })
        .select("id")
        .single();
      targetListId = newList?.id;
    }
  }

  if (!targetListId) {
    return NextResponse.json({ error: "Could not find or create shopping list" }, { status: 500 });
  }

  // Scale quantities if multiplier provided
  const multiplier = servings_multiplier || 1;

  // Fetch shopping categories for auto-categorization
  const { config: configSchema } = await import("@/lib/supabase/schemas");
  const { buildCategoryLookup: buildLookup, autoCategorize: autocat } = await import("@/lib/shopping-categorize");
  const { data: shopCategories } = await configSchema(supabase)
    .from("shopping_categories")
    .select("id, name")
    .eq("active", true);
  const catLookup = buildLookup(shopCategories || []);

  const shoppingItems = ingredients
    .filter((ing: { is_optional: boolean }) => !ing.is_optional)
    .map((ing: { name: string; quantity: string | null; category_id: string | null }) => ({
      list_id: targetListId,
      name: ing.name,
      quantity: scaleQuantity(ing.quantity, multiplier),
      category_id: ing.category_id || autocat(ing.name, catLookup),
      is_staple: false,
      added_by: user.id,
      source: "recipe",
    }));

  const { data: created, error } = await household(supabase)
    .from("shopping_items")
    .insert(shoppingItems)
    .select("*");

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "shopping_list",
    entity_id: targetListId,
    action: "recipe_added",
    performed_by: user.id,
    metadata: { recipe_id: recipeId, recipe_title: recipe.title, items_added: created?.length || 0 },
  }).catch(console.error);

  return NextResponse.json({
    list_id: targetListId,
    items_added: created?.length || 0,
    items: created,
  }, { status: 201 });
});

/**
 * Scale a quantity string by a multiplier.
 * Handles simple numeric quantities (e.g., "2 cups" → "4 cups" with multiplier 2).
 * For complex quantities, returns the original string with multiplier note.
 */
function scaleQuantity(quantity: string | null, multiplier: number): string | null {
  if (!quantity || multiplier === 1) return quantity;

  // Try to parse leading number
  const match = quantity.match(/^(\d+\.?\d*)\s*(.*)/);
  if (match) {
    const num = parseFloat(match[1]) * multiplier;
    const unit = match[2];
    // Format nicely — no trailing .0
    const formatted = num % 1 === 0 ? num.toString() : num.toFixed(1);
    return unit ? `${formatted} ${unit}` : formatted;
  }

  // Try fraction format (e.g., "1/2 cup")
  const fracMatch = quantity.match(/^(\d+)\/(\d+)\s*(.*)/);
  if (fracMatch) {
    const num = (parseInt(fracMatch[1]) / parseInt(fracMatch[2])) * multiplier;
    const unit = fracMatch[3];
    const formatted = num % 1 === 0 ? num.toString() : num.toFixed(1);
    return unit ? `${formatted} ${unit}` : formatted;
  }

  return quantity;
}

