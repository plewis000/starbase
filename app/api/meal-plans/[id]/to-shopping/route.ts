import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { household } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";

// POST /api/meal-plans/[id]/to-shopping — Convert all meal plan recipes to shopping list
export const POST = withAuth(async (request: NextRequest, { supabase, user }, params) => {
  const planId = params.id;
  let body;
  try { body = await request.json(); } catch { body = {}; }

  const { list_id } = body;

  // Get meal plan with entries + recipe ingredients
  const { data: plan } = await household(supabase)
    .from("meal_plans")
    .select("id, week_start, entries:meal_plan_entries(recipe_id, servings_override, recipe:recipes(id, title, servings))")
    .eq("id", planId)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "Meal plan not found" }, { status: 404 });
  }

  const entries = plan.entries || [];
  const recipeIds = entries
    .map((e: { recipe_id: string | null }) => e.recipe_id)
    .filter((id: string | null): id is string => !!id);

  if (recipeIds.length === 0) {
    return NextResponse.json({ error: "Meal plan has no recipes" }, { status: 400 });
  }

  // Fetch all ingredients for all recipes in the plan
  const { data: allIngredients } = await household(supabase)
    .from("recipe_ingredients")
    .select("*")
    .in("recipe_id", recipeIds);

  if (!allIngredients || allIngredients.length === 0) {
    return NextResponse.json({ error: "No ingredients found in meal plan recipes" }, { status: 400 });
  }

  // Aggregate: group by ingredient name (case-insensitive), combine quantities smartly
  const aggregated = new Map<string, { name: string; quantities: string[]; category_id: string | null }>();

  for (const ing of allIngredients) {
    if (ing.is_optional) continue;
    const key = ing.name.toLowerCase().trim();
    const existing = aggregated.get(key);
    if (existing) {
      if (ing.quantity) existing.quantities.push(ing.quantity);
      if (!existing.category_id && ing.category_id) existing.category_id = ing.category_id;
    } else {
      aggregated.set(key, {
        name: ing.name,
        quantities: ing.quantity ? [ing.quantity] : [],
        category_id: ing.category_id,
      });
    }
  }

  // Find or create target shopping list
  let targetListId = list_id;
  if (!targetListId) {
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
          name: `Groceries — week of ${plan.week_start}`,
          is_default: true,
          created_by: user.id,
          source: "meal_plan",
        })
        .select("id")
        .single();
      targetListId = newList?.id;
    }
  }

  if (!targetListId) {
    return NextResponse.json({ error: "Could not find or create shopping list" }, { status: 500 });
  }

  // Build shopping items with smart quantity aggregation
  const shoppingItems = Array.from(aggregated.values()).map(agg => ({
    list_id: targetListId,
    name: agg.name,
    quantity: mergeQuantities(agg.quantities),
    category_id: agg.category_id,
    is_staple: false,
    added_by: user.id,
    source: "meal_plan",
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
    action: "meal_plan_added",
    performed_by: user.id,
    metadata: {
      meal_plan_id: planId,
      week_start: plan.week_start,
      recipes_count: recipeIds.length,
      items_added: created?.length || 0,
    },
  }).catch(console.error);

  return NextResponse.json({
    list_id: targetListId,
    items_added: created?.length || 0,
    items: created,
  }, { status: 201 });
});

/**
 * Smart quantity merging: combines quantities with matching units.
 * "2 cups" + "1 cup" → "3 cups"
 * "2 cups" + "3 tbsp" → "2 cups + 3 tbsp" (different units kept separate)
 * "2" + "3" → "5" (unitless adds up)
 */
function mergeQuantities(quantities: string[]): string | null {
  if (quantities.length === 0) return null;
  if (quantities.length === 1) return quantities[0];

  // Parse each quantity into { amount, unit }
  const parsed: { amount: number; unit: string; raw: string }[] = [];
  for (const q of quantities) {
    const match = q.match(/^(\d+\.?\d*)\s*(.*)/);
    if (match) {
      parsed.push({ amount: parseFloat(match[1]), unit: match[2].trim().toLowerCase(), raw: q });
    } else {
      const fracMatch = q.match(/^(\d+)\/(\d+)\s*(.*)/);
      if (fracMatch) {
        parsed.push({
          amount: parseInt(fracMatch[1]) / parseInt(fracMatch[2]),
          unit: fracMatch[3].trim().toLowerCase(),
          raw: q,
        });
      } else {
        // Unparseable — fall back to string join
        return quantities.join(" + ");
      }
    }
  }

  // Group by normalized unit
  const byUnit = new Map<string, number>();
  const unitDisplay = new Map<string, string>(); // preserve original casing
  for (const p of parsed) {
    const norm = normalizeUnit(p.unit);
    byUnit.set(norm, (byUnit.get(norm) || 0) + p.amount);
    if (!unitDisplay.has(norm)) unitDisplay.set(norm, p.unit);
  }

  // Format results
  const parts: string[] = [];
  for (const [norm, total] of byUnit) {
    const display = unitDisplay.get(norm) || norm;
    const formatted = total % 1 === 0 ? total.toString() : total.toFixed(1);
    parts.push(display ? `${formatted} ${display}` : formatted);
  }

  return parts.join(" + ");
}

function normalizeUnit(unit: string): string {
  const aliases: Record<string, string> = {
    cup: "cups", c: "cups",
    tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
    tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
    oz: "oz", ounce: "oz", ounces: "oz",
    lb: "lbs", lbs: "lbs", pound: "lbs", pounds: "lbs",
    g: "g", gram: "g", grams: "g",
    kg: "kg", kilogram: "kg", kilograms: "kg",
    ml: "ml", milliliter: "ml", milliliters: "ml",
    l: "l", liter: "l", liters: "l",
    can: "cans", cans: "cans",
    bag: "bags", bags: "bags",
    box: "boxes", boxes: "boxes",
    bottle: "bottles", bottles: "bottles",
    pack: "packs", packs: "packs",
    bunch: "bunches", bunches: "bunches",
    "": "",
  };
  return aliases[unit] ?? unit;
}
