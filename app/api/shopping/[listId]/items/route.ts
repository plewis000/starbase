import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { household } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds } from "@/lib/household";

// POST /api/shopping/[listId]/items — Add item(s) to list
export const POST = withAuth(async (request: NextRequest, { supabase, user, ctx }, params) => {
  const listId = params?.listId;

  // Verify list belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const { data: listCheck } = await household(supabase)
    .from("shopping_lists")
    .select("id")
    .eq("id", listId)
    .in("created_by", memberIds)
    .single();
  if (!listCheck) return NextResponse.json({ error: "List not found" }, { status: 404 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // Support single item or batch
  const items = Array.isArray(body.items) ? body.items : [body];

  const inserts = items.map((item: Record<string, unknown>) => ({
    list_id: listId,
    name: typeof item.name === "string" ? item.name.trim().slice(0, 300) : "",
    quantity: typeof item.quantity === "string" ? item.quantity.trim() || null : item.quantity ? String(item.quantity) : null,
    category_id: item.category_id || null,
    is_staple: item.is_staple || false,
    added_by: user.id,
    source: "manual",
  }));

  // Validate all items have names
  if (inserts.some((i: { name: string }) => !i.name)) {
    return NextResponse.json({ error: "All items must have a name" }, { status: 400 });
  }

  const { data: created, error } = await household(supabase)
    .from("shopping_items")
    .insert(inserts)
    .select("*");

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  return NextResponse.json({ items: created }, { status: 201 });
});
