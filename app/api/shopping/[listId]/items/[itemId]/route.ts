import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { household } from "@/lib/supabase/schemas";

// PATCH /api/shopping/[listId]/items/[itemId] — Update item (check/uncheck, edit)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string; itemId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listId, itemId } = await params;
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Item not found in this list" }, { status: 404 });

  return NextResponse.json({ item });
}

// DELETE /api/shopping/[listId]/items/[itemId] — Remove item
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string; itemId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listId, itemId } = await params;

  const { error } = await household(supabase)
    .from("shopping_items")
    .delete()
    .eq("id", itemId)
    .eq("list_id", listId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
