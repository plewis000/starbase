import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finance, config } from "@/lib/supabase/schemas";

// GET /api/finance/budgets — Get active budgets with current spending
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const month = params.get("month") || new Date().toISOString().slice(0, 7); // YYYY-MM

  // Fetch active budgets
  const { data: budgets, error } = await finance(supabase)
    .from("budgets")
    .select("*, budget_alerts(*)")
    .eq("user_id", user.id)
    .is("effective_until", null)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch categories
  const { data: categories } = await config(supabase)
    .from("expense_categories")
    .select("id, name, slug, display_color, icon")
    .eq("active", true);

  const categoryMap = new Map((categories || []).map((c) => [c.id, c]));

  // Calculate actual spending per category for the month
  const monthStart = `${month}-01`;
  const nextMonth = new Date(monthStart);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthEnd = nextMonth.toISOString().slice(0, 10);

  // Get non-split transactions for the month
  const { data: transactions } = await finance(supabase)
    .from("transactions")
    .select("amount, category_id, is_split_parent")
    .eq("user_id", user.id)
    .eq("excluded", false)
    .eq("pending", false)
    .is("split_parent_id", null)
    .gte("transaction_date", monthStart)
    .lt("transaction_date", monthEnd);

  // Get splits for the month (from split parents)
  const { data: splitParentIds } = await finance(supabase)
    .from("transactions")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_split_parent", true)
    .eq("excluded", false)
    .gte("transaction_date", monthStart)
    .lt("transaction_date", monthEnd);

  let splits: { amount: number; category_id: string | null }[] = [];
  if (splitParentIds && splitParentIds.length > 0) {
    const parentIds = splitParentIds.map((p) => p.id);
    const { data: splitData } = await finance(supabase)
      .from("transaction_splits")
      .select("amount, category_id")
      .in("parent_transaction_id", parentIds);
    splits = splitData || [];
  }

  // Aggregate spending by category
  const spendingByCategory = new Map<string, number>();

  for (const tx of (transactions || [])) {
    if (tx.is_split_parent) continue; // Splits handled separately
    if (!tx.category_id) continue;
    const amount = Math.abs(Number(tx.amount));
    spendingByCategory.set(tx.category_id, (spendingByCategory.get(tx.category_id) || 0) + amount);
  }

  for (const split of splits) {
    if (!split.category_id) continue;
    const amount = Math.abs(Number(split.amount));
    spendingByCategory.set(split.category_id, (spendingByCategory.get(split.category_id) || 0) + amount);
  }

  // Enrich budgets with spending and category info
  const enriched = (budgets || []).map((b) => ({
    ...b,
    category: categoryMap.get(b.category_id) || null,
    spent: spendingByCategory.get(b.category_id) || 0,
    remaining: Number(b.monthly_amount) - (spendingByCategory.get(b.category_id) || 0),
    percent_used: Math.round(((spendingByCategory.get(b.category_id) || 0) / Number(b.monthly_amount)) * 100),
  }));

  return NextResponse.json({ budgets: enriched, month });
}

// POST /api/finance/budgets — Create or update a budget for a category
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { category_id, monthly_amount, alerts } = body;

  if (!category_id) return NextResponse.json({ error: "category_id is required" }, { status: 400 });
  if (!monthly_amount || Number(monthly_amount) <= 0) {
    return NextResponse.json({ error: "monthly_amount must be positive" }, { status: 400 });
  }

  // Deactivate existing budget for this category (soft close)
  await finance(supabase)
    .from("budgets")
    .update({ effective_until: new Date().toISOString().slice(0, 10) })
    .eq("category_id", category_id)
    .eq("user_id", user.id)
    .is("effective_until", null);

  // Create new budget
  const { data: budget, error } = await finance(supabase)
    .from("budgets")
    .insert({
      category_id,
      monthly_amount: Number(monthly_amount),
      user_id: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Create default alerts if requested or use defaults
  const alertThresholds = Array.isArray(alerts) ? alerts : [75, 90];
  const alertInserts = alertThresholds.map((threshold: number) => ({
    budget_id: budget.id,
    threshold_percent: threshold,
    channel: "discord",
  }));

  if (alertInserts.length > 0) {
    await finance(supabase).from("budget_alerts").insert(alertInserts);
  }

  return NextResponse.json({ budget }, { status: 201 });
}
