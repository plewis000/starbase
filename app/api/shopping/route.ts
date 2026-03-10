import { NextRequest, NextResponse, after } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { household } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds } from "@/lib/household";
import { parseBody, createShoppingListSchema } from "@/lib/schemas";

// GET /api/shopping — List all shopping lists
export const GET = withAuth(async (_request: NextRequest, { supabase, ctx }) => {
  // Scope to household members
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  const { data: lists, error } = await household(supabase)
    .from("shopping_lists")
    .select("*")
    .in("created_by", memberIds)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  // Fetch ALL shopping items for all lists in ONE query, then compute counts in memory
  const listIds = (lists || []).map(l => l.id);
  const { data: allItems } = listIds.length > 0
    ? await household(supabase)
        .from("shopping_items")
        .select("list_id, checked")
        .in("list_id", listIds)
    : { data: [] as { list_id: string; checked: boolean }[] };

  const totalByList = new Map<string, number>();
  const checkedByList = new Map<string, number>();
  for (const item of allItems || []) {
    totalByList.set(item.list_id, (totalByList.get(item.list_id) || 0) + 1);
    if (item.checked) {
      checkedByList.set(item.list_id, (checkedByList.get(item.list_id) || 0) + 1);
    }
  }

  const listsWithCounts = (lists || []).map(list => ({
    ...list,
    total_items: totalByList.get(list.id) || 0,
    checked_items: checkedByList.get(list.id) || 0,
  }));

  return NextResponse.json({ lists: listsWithCounts });
});

// POST /api/shopping — Create a new shopping list
export const POST = withAuth(async (request: NextRequest, { supabase, user }) => {
  const parsed = await parseBody(request, createShoppingListSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const data = parsed.data;

  const { data: list, error } = await household(supabase)
    .from("shopping_lists")
    .insert({
      name: data.name,
      store: data.store,
      is_default: data.is_default,
      created_by: user.id,
      source: "manual",
    })
    .select("*")
    .single();

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  // Auto-populate staple items from other lists (runs after response)
  if (list) {
    after(async () => {
      try {
        // Find unique staple items across all lists (deduplicated by lowercase name)
        const { data: staples } = await household(supabase)
          .from("shopping_items")
          .select("name, quantity, category_id")
          .eq("is_staple", true)
          .neq("list_id", list.id);

        if (staples && staples.length > 0) {
          // Deduplicate by name
          const seen = new Set<string>();
          const uniqueStaples = staples.filter(s => {
            const key = s.name.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          if (uniqueStaples.length > 0) {
            await household(supabase)
              .from("shopping_items")
              .insert(uniqueStaples.map(s => ({
                list_id: list.id,
                name: s.name,
                quantity: s.quantity,
                category_id: s.category_id,
                is_staple: true,
                added_by: user.id,
                source: "staple_auto",
              })));
          }
        }
      } catch (err) {
        console.error("[shopping] Staple auto-populate failed:", err);
      }
    });
  }

  return NextResponse.json({ list }, { status: 201 });
});
