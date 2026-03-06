import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { household } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds } from "@/lib/household";
import { parseBody, updateShoppingItemSchema } from "@/lib/schemas";

// PATCH /api/shopping/[listId]/items/[itemId] — Update item (check/uncheck, edit)
export const PATCH = withAuth(async (request: NextRequest, { supabase, user, ctx }, params) => {
  const listId = params?.listId;
  const itemId = params?.itemId;

  // Verify list belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const { data: listCheck } = await household(supabase)
    .from("shopping_lists")
    .select("id")
    .eq("id", listId)
    .in("created_by", memberIds)
    .single();
  if (!listCheck) return NextResponse.json({ error: "List not found" }, { status: 404 });

  const parsed = await parseBody(request, updateShoppingItemSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const data = parsed.data;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.quantity !== undefined) updates.quantity = data.quantity != null ? String(data.quantity) : null;
  if (data.category !== undefined) updates.category_id = data.category;
  if (data.is_staple !== undefined) updates.is_staple = data.is_staple;
  if (data.sort_order !== undefined) updates.sort_order = data.sort_order;

  if (data.checked !== undefined) {
    updates.checked = data.checked;
    updates.checked_at = data.checked ? new Date().toISOString() : null;
    updates.checked_by = data.checked ? user.id : null;
  }

  const { data: item, error } = await household(supabase)
    .from("shopping_items")
    .update(updates)
    .eq("id", itemId)
    .eq("list_id", listId)
    .select("*")
    .single();

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
  if (!item) return NextResponse.json({ error: "Item not found in this list" }, { status: 404 });

  return NextResponse.json({ item });
});

// DELETE /api/shopping/[listId]/items/[itemId] — Remove item
export const DELETE = withAuth(async (_request: NextRequest, { supabase, ctx }, params) => {
  const listId = params?.listId;
  const itemId = params?.itemId;

  // Verify list belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const { data: listCheck } = await household(supabase)
    .from("shopping_lists")
    .select("id")
    .eq("id", listId)
    .in("created_by", memberIds)
    .single();
  if (!listCheck) return NextResponse.json({ error: "List not found" }, { status: 404 });

  const { error } = await household(supabase)
    .from("shopping_items")
    .delete()
    .eq("id", itemId)
    .eq("list_id", listId);

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  return NextResponse.json({ success: true });
});
