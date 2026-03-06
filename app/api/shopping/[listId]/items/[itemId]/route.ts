import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { household } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds } from "@/lib/household";

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

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) updates.name = typeof body.name === "string" ? body.name.trim() : String(body.name);
  if (body.quantity !== undefined) updates.quantity = typeof body.quantity === "string" ? body.quantity.trim() || null : body.quantity ? String(body.quantity) : null;
  if (body.category_id !== undefined) updates.category_id = body.category_id || null;
  if (body.is_staple !== undefined) updates.is_staple = body.is_staple;

  if (body.checked !== undefined) {
    updates.checked = body.checked;
    updates.checked_at = body.checked ? new Date().toISOString() : null;
    updates.checked_by = body.checked ? user.id : null;
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
