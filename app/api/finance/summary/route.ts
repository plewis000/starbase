import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finance, config } from "@/lib/supabase/schemas";

// GET /api/finance/summary — Spending summary by category for a period
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const period = params.get("period") || "month"; // month, week, year, custom
  const month = params.get("month"); // YYYY-MM for month period
  const from = params.get("from"); // YYYY-MM-DD for custom
  const to = params.get("to");

  // Calculate date range
  let startDate: string;
  let endDate: string;
  const now = new Date();

  if (period === "custom" && from && to) {
    startDate = from;
    endDate = to;
  } else if (period === "week") {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Sunday
    startDate = weekStart.toISOString().slice(0, 10);
    endDate = now.toISOString().slice(0, 10);
  } else if (period === "year") {
    startDate = `${now.getFullYear()}-01-01`;
    endDate = now.toISOString().slice(0, 10);
  } else {
    // Default: current month
    const m = month || now.toISOString().slice(0, 7);
    startDate = `${m}-01`;
    const next = new Date(startDate);
    next.setMonth(next.getMonth() + 1);
    endDate = next.toISOString().slice(0, 10);
  }

  // Fetch categories
  const { data: categories } = await config(supabase)
    .from("expense_categories")
    .select("id, name, slug, display_color, icon, is_income")
    .eq("active", true)
    .order("sort_order");

  const categoryMap = new Map((categories || []).map((c) => [c.id, c]));

  // Fetch non-split transactions
  const { data: transactions } = await finance(supabase)
    .from("transactions")
    .select("amount, category_id, is_split_parent, pending")
    .eq("user_id", user.id)
    .eq("excluded", false)
    .is("split_parent_id", null)
    .gte("transaction_date", startDate)
    .lt("transaction_date", endDate);

  // Fetch splits from split parents in range
  const { data: splitParents } = await finance(supabase)
    .from("transactions")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_split_parent", true)
    .eq("excluded", false)
    .gte("transaction_date", startDate)
    .lt("transaction_date", endDate);

  let splits: { amount: number; category_id: string | null }[] = [];
  if (splitParents && splitParents.length > 0) {
    const { data: splitData } = await finance(supabase)
      .from("transaction_splits")
      .select("amount, category_id")
      .in("parent_transaction_id", splitParents.map((p) => p.id));
    splits = splitData || [];
  }

  // Aggregate
  const spending = new Map<string, number>();
  let totalSpending = 0;
  let totalIncome = 0;
  let pendingTotal = 0;

  for (const tx of (transactions || [])) {
    const amount = Math.abs(Number(tx.amount));
    const cat = tx.category_id ? categoryMap.get(tx.category_id) : null;

    if (tx.pending) {
      pendingTotal += amount;
      continue;
    }

    if (tx.is_split_parent) continue; // Handled via splits

    if (cat?.is_income) {
      totalIncome += amount;
    } else {
      totalSpending += amount;
      if (tx.category_id) {
        spending.set(tx.category_id, (spending.get(tx.category_id) || 0) + amount);
      }
    }
  }

  for (const split of splits) {
    const amount = Math.abs(Number(split.amount));
    const cat = split.category_id ? categoryMap.get(split.category_id) : null;
    if (cat?.is_income) {
      totalIncome += amount;
    } else {
      totalSpending += amount;
      if (split.category_id) {
        spending.set(split.category_id, (spending.get(split.category_id) || 0) + amount);
      }
    }
  }

  // Build category breakdown
  const breakdown = Array.from(spending.entries())
    .map(([catId, amount]) => ({
      category: categoryMap.get(catId) || { id: catId, name: "Unknown", slug: "unknown" },
      amount: Math.round(amount * 100) / 100,
      percent: totalSpending > 0 ? Math.round((amount / totalSpending) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Fetch active budgets for comparison
  const { data: budgets } = await finance(supabase)
    .from("budgets")
    .select("category_id, monthly_amount")
    .eq("user_id", user.id)
    .is("effective_until", null);

  const budgetMap = new Map((budgets || []).map((b) => [b.category_id, Number(b.monthly_amount)]));

  const budgetComparison = breakdown.map((b) => ({
    ...b,
    budget: budgetMap.get(b.category.id) || null,
    over_budget: budgetMap.has(b.category.id) ? b.amount > (budgetMap.get(b.category.id) || 0) : false,
  }));

  // Days in period for daily average
  const daysDiff = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000));
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();

  return NextResponse.json({
    period: { start: startDate, end: endDate, days: daysDiff },
    total_spending: Math.round(totalSpending * 100) / 100,
    total_income: Math.round(totalIncome * 100) / 100,
    net: Math.round((totalIncome - totalSpending) * 100) / 100,
    pending_total: Math.round(pendingTotal * 100) / 100,
    daily_average: Math.round((totalSpending / daysDiff) * 100) / 100,
    projected_monthly: period === "month" ? Math.round((totalSpending / dayOfMonth) * daysInMonth * 100) / 100 : null,
    breakdown: budgetComparison,
    unreviewed_count: (transactions || []).filter((t) => !t.is_split_parent && !(categoryMap.get(t.category_id || "")?.is_income)).length,
  });
}
