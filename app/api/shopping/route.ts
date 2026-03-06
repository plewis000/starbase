import { NextRequest, NextResponse } from "next/server";
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

  // For each list, get item counts
  const listsWithCounts = await Promise.all(
    (lists || []).map(async (list) => {
      const { count: totalCount } = await household(supabase)
        .from("shopping_items")
        .select("*", { count: "exact", head: true })
        .eq("list_id", list.id);

      const { count: checkedCount } = await household(supabase)
        .from("shopping_items")
        .select("*", { count: "exact", head: true })
        .eq("list_id", list.id)
        .eq("checked", true);

      return {
        ...list,
        total_items: totalCount || 0,
        checked_items: checkedCount || 0,
      };
    })
  );

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
      is_default: data.is_default,
      created_by: user.id,
      source: "manual",
    })
    .select("*")
    .single();

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  return NextResponse.json({ list }, { status: 201 });
});
