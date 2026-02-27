import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finance, config } from "@/lib/supabase/schemas";

// GET /api/finance/transactions — List transactions with filters
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(params.get("limit") || "50"), 200);
  const offset = parseInt(params.get("offset") || "0");
  const category_id = params.get("category_id");
  const reviewed = params.get("reviewed");
  const pending = params.get("pending");
  const excluded = params.get("excluded");
  const from = params.get("from"); // date YYYY-MM-DD
  const to = params.get("to");
  const search = params.get("search");
  const account_id = params.get("account_id");

  let query = finance(supabase)
    .from("transactions")
    .select("*, transaction_splits(*)", { count: "exact" })
    .eq("user_id", user.id)
    .is("split_parent_id", null) // Don't return split children as top-level
    .order("transaction_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category_id) query = query.eq("category_id", category_id);
  if (reviewed === "true") query = query.eq("reviewed", true);
  if (reviewed === "false") query = query.eq("reviewed", false);
  if (pending === "true") query = query.eq("pending", true);
  if (pending === "false") query = query.eq("pending", false);
  if (excluded === "true") query = query.eq("excluded", true);
  if (excluded === "false") query = query.eq("excluded", false);
  if (from) query = query.gte("transaction_date", from);
  if (to) query = query.lte("transaction_date", to);
  if (search) query = query.or(`merchant_name.ilike.%${search}%,description.ilike.%${search}%`);
  if (account_id) query = query.eq("plaid_account_id", account_id);

  const { data: transactions, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with category names
  const { data: categories } = await config(supabase)
    .from("expense_categories")
    .select("id, name, slug, display_color, icon")
    .eq("active", true);

  const categoryMap = new Map((categories || []).map((c) => [c.id, c]));

  const enriched = (transactions || []).map((t) => ({
    ...t,
    category: t.category_id ? categoryMap.get(t.category_id) || null : null,
  }));

  return NextResponse.json({ transactions: enriched, total: count });
}

// POST /api/finance/transactions — Create a manual transaction
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { amount, description, category_id, transaction_date, merchant_name, notes } = body;

  if (amount === undefined || amount === null) {
    return NextResponse.json({ error: "amount is required" }, { status: 400 });
  }
  if (!transaction_date) {
    return NextResponse.json({ error: "transaction_date is required" }, { status: 400 });
  }

  const { data: transaction, error } = await finance(supabase)
    .from("transactions")
    .insert({
      amount: Number(amount),
      description: typeof description === "string" ? description.trim() : null,
      category_id: category_id || null,
      transaction_date,
      merchant_name: typeof merchant_name === "string" ? merchant_name.trim() : null,
      user_id: user.id,
      source: "manual",
      reviewed: true,
      notes: typeof notes === "string" ? notes.trim() : null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ transaction }, { status: 201 });
}
