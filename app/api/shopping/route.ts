import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { household } from "@/lib/supabase/schemas";
import { getHouseholdContext, getHouseholdMemberIds } from "@/lib/household";

// GET /api/shopping — List all shopping lists
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Scope to household members
  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household found" }, { status: 404 });
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  const { data: lists, error } = await household(supabase)
    .from("shopping_lists")
    .select("*")
    .in("created_by", memberIds)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
}

// POST /api/shopping — Create a new shopping list
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { name, store, is_default } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data: list, error } = await household(supabase)
    .from("shopping_lists")
    .insert({
      name: name.trim(),
      store: store?.trim() || null,
      is_default: is_default || false,
      created_by: user.id,
      source: "manual",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ list }, { status: 201 });
}
