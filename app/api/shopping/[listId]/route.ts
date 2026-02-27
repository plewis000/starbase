import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { household, config } from "@/lib/supabase/schemas";

// GET /api/shopping/[listId] — Get a single list with all items
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listId } = await params;

  const { data: list, error } = await household(supabase)
    .from("shopping_lists")
    .select("*")
    .eq("id", listId)
    .single();

  if (error || !list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  // Fetch items
  const { data: items } = await household(supabase)
    .from("shopping_items")
    .select("*")
    .eq("list_id", listId)
    .order("checked", { ascending: true })
    .order("created_at", { ascending: true });

  // Fetch categories for enrichment
  const { data: categories } = await config(supabase)
    .from("shopping_categories")
    .select("id, name, display_color, icon, sort_order")
    .eq("active", true)
    .order("sort_order");

  const categoryMap = new Map((categories || []).map((c) => [c.id, c]));

  const enrichedItems = (items || []).map((item) => ({
    ...item,
    category: item.category_id ? categoryMap.get(item.category_id) || null : null,
  }));

  return NextResponse.json({
    list: {
      ...list,
      items: enrichedItems,
    },
  });
}

// PATCH /api/shopping/[listId] — Update list metadata
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listId } = await params;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = typeof body.name === "string" ? body.name.trim() : String(body.name);
  if (body.store !== undefined) updates.store = typeof body.store === "string" ? body.store.trim() || null : null;
  if (body.is_default !== undefined) updates.is_default = body.is_default;

  const { data: list, error } = await household(supabase)
    .from("shopping_lists")
    .update(updates)
    .eq("id", listId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ list });
}

// DELETE /api/shopping/[listId] — Delete a list and all its items
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listId } = await params;

  const { error } = await household(supabase)
    .from("shopping_lists")
    .delete()
    .eq("id", listId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
