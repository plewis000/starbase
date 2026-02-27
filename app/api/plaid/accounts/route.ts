import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finance } from "@/lib/supabase/schemas";

// GET /api/plaid/accounts — List linked bank accounts
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all plaid items for user
  const { data: items } = await finance(supabase)
    .from("plaid_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (!items || items.length === 0) {
    return NextResponse.json({ items: [], accounts: [] });
  }

  // Get all accounts for those items
  const itemIds = items.map((i) => i.id);
  const { data: accounts } = await finance(supabase)
    .from("plaid_accounts")
    .select("*")
    .in("plaid_item_id", itemIds)
    .eq("active", true)
    .order("name");

  // Group accounts by item
  const enriched = items.map((item) => ({
    ...item,
    accounts: (accounts || []).filter((a) => a.plaid_item_id === item.id),
  }));

  return NextResponse.json({
    items: enriched,
    accounts: accounts || [],
  });
}
