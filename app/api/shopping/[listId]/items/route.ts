import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { household } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds } from "@/lib/household";
import { parseBody, createShoppingItemSchema } from "@/lib/schemas";
import { z } from "zod";

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

  // Support single item or batch: { items: [...] } or { name, ... }
  const batchSchema = z.object({ items: z.array(createShoppingItemSchema).min(1).max(100) });
  const singleSchema = createShoppingItemSchema.transform((item) => ({ items: [item] }));
  const parsed = await parseBody(request, z.union([batchSchema, singleSchema]));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const inserts = parsed.data.items.map((item) => ({
    list_id: listId,
    name: item.name,
    quantity: item.quantity || null,
    category_id: item.category_id ?? null,
    is_staple: item.is_staple,
    added_by: user.id,
    source: "manual",
  }));

  const { data: created, error } = await household(supabase)
    .from("shopping_items")
    .insert(inserts)
    .select("*");

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  return NextResponse.json({ items: created }, { status: 201 });
});
