import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { household } from "@/lib/supabase/schemas";
import { getHouseholdContext, getHouseholdMemberIds } from "@/lib/household";

// POST /api/shopping/[listId]/items — Add item(s) to list
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listId } = await params;

  // Verify list belongs to user's household
  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household found" }, { status: 404 });
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
    name: typeof item.name === "string" ? item.name.trim() : "",
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: created }, { status: 201 });
}
