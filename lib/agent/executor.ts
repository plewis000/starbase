import { SupabaseClient } from "@supabase/supabase-js";
import { finance, config, platform } from "@/lib/supabase/schemas";

type Supabase = SupabaseClient;

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Execute a tool call against the database
// All queries run as the authenticated user (RLS enforced)
export async function executeTool(
  supabase: Supabase,
  userId: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    switch (toolName) {
      // ── TASKS ──
      case "list_tasks":
        return await listTasks(supabase, userId, input);
      case "create_task":
        return await createTask(supabase, userId, input);
      case "update_task":
        return await updateTask(supabase, input);
      case "complete_task":
        return await completeTask(supabase, input);

      // ── HABITS ──
      case "list_habits":
        return await listHabits(supabase, input);
      case "check_in_habit":
        return await checkInHabit(supabase, userId, input);
      case "create_habit":
        return await createHabit(supabase, userId, input);

      // ── GOALS ──
      case "list_goals":
        return await listGoals(supabase, input);
      case "update_goal_progress":
        return await updateGoalProgress(supabase, input);

      // ── SHOPPING ──
      case "list_shopping":
        return await listShopping(supabase);
      case "get_shopping_list":
        return await getShoppingList(supabase, input);
      case "add_shopping_items":
        return await addShoppingItems(supabase, input);

      // ── FINANCE ──
      case "get_spending_summary":
        return await getSpendingSummary(supabase, userId, input);
      case "list_transactions":
        return await listTransactions(supabase, userId, input);
      case "categorize_transaction":
        return await categorizeTransaction(supabase, userId, input);
      case "get_budgets":
        return await getBudgets(supabase, userId, input);
      case "create_budget":
        return await createBudget(supabase, userId, input);

      // ── FEEDBACK ──
      case "submit_feedback":
        return await submitFeedback(supabase, userId, input);

      // ── DASHBOARD ──
      case "get_dashboard":
        return await getDashboard(supabase, userId);

      // ── NOTIFICATIONS ──
      case "get_notifications":
        return await getNotifications(supabase, userId, input);

      // ── CONFIG ──
      case "get_expense_categories":
        return await getExpenseCategories(supabase);

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`Tool execution error (${toolName}):`, err);
    return { success: false, error: "Tool execution failed" };
  }
}

// ── TASK IMPLEMENTATIONS ──

async function listTasks(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const limit = Math.min(Number(input.limit) || 20, 50);
  let query = platform(supabase)
    .from("tasks")
    .select("id, title, description, due_date, schedule_date, status:task_statuses(name, icon), priority:task_priorities(name, icon), assigned_to")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (input.status) {
    query = query.eq("task_statuses.name", input.status as string);
  }
  if (input.priority) {
    query = query.eq("task_priorities.name", input.priority as string);
  }
  if (input.due_today) {
    const today = new Date().toISOString().slice(0, 10);
    query = query.eq("due_date", today);
  }
  if (input.search) {
    query = query.or(`title.ilike.%${input.search}%,description.ilike.%${input.search}%`);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { tasks: data, count: data?.length || 0 } };
}

async function createTask(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  if (!input.title) return { success: false, error: "title is required" };

  // Look up priority by name if provided as string
  let priorityId = input.priority as string | undefined;
  if (priorityId && !priorityId.match(/^[0-9a-f-]{36}$/)) {
    const { data: pri } = await config(supabase)
      .from("task_priorities")
      .select("id")
      .ilike("name", priorityId)
      .single();
    priorityId = pri?.id;
  }

  const { data, error } = await platform(supabase)
    .from("tasks")
    .insert({
      title: input.title as string,
      description: (input.description as string) || null,
      due_date: (input.due_date as string) || null,
      priority_id: priorityId || null,
      assigned_to: userId,
      created_by: userId,
    })
    .select("id, title, due_date")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { task: data, message: `Task "${data.title}" created` } };
}

async function updateTask(supabase: Supabase, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.task_id as string;
  if (!id) return { success: false, error: "task_id is required" };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title) updates.title = input.title;
  if (input.description) updates.description = input.description;
  if (input.due_date) updates.due_date = input.due_date;

  // Resolve status/priority names to IDs
  if (input.status) {
    const name = input.status as string;
    if (!name.match(/^[0-9a-f-]{36}$/)) {
      const { data: s } = await config(supabase).from("task_statuses").select("id").ilike("name", name).single();
      if (s) updates.status_id = s.id;
    } else {
      updates.status_id = name;
    }
  }
  if (input.priority) {
    const name = input.priority as string;
    if (!name.match(/^[0-9a-f-]{36}$/)) {
      const { data: p } = await config(supabase).from("task_priorities").select("id").ilike("name", name).single();
      if (p) updates.priority_id = p.id;
    } else {
      updates.priority_id = name;
    }
  }

  const { data, error } = await platform(supabase)
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select("id, title")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { task: data, message: `Task "${data.title}" updated` } };
}

async function completeTask(supabase: Supabase, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.task_id as string;
  if (!id) return { success: false, error: "task_id is required" };

  // Find the "done" status
  const { data: doneStatus } = await config(supabase)
    .from("task_statuses")
    .select("id")
    .ilike("name", "done")
    .single();

  if (!doneStatus) return { success: false, error: "Could not find 'done' status" };

  const { data, error } = await platform(supabase)
    .from("tasks")
    .update({
      status_id: doneStatus.id,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, title")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { task: data, message: `Task "${data.title}" completed` } };
}

// ── HABIT IMPLEMENTATIONS ──

async function listHabits(supabase: Supabase, input: Record<string, unknown>): Promise<ToolResult> {
  let query = platform(supabase)
    .from("habits")
    .select("id, title, description, status, frequency:habit_frequencies(name), current_streak, longest_streak, last_check_in")
    .order("title");

  if (input.status) query = query.eq("status", input.status as string);
  else query = query.eq("status", "active");

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { habits: data, count: data?.length || 0 } };
}

async function checkInHabit(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const habitId = input.habit_id as string;
  if (!habitId) return { success: false, error: "habit_id is required" };

  const checkDate = (input.date as string) || new Date().toISOString().slice(0, 10);

  const { data, error } = await platform(supabase)
    .from("habit_check_ins")
    .upsert({
      habit_id: habitId,
      user_id: userId,
      check_date: checkDate,
      value: input.value ? Number(input.value) : 1,
      note: (input.note as string) || null,
    }, { onConflict: "habit_id,user_id,check_date" })
    .select("id, check_date, value")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { check_in: data, message: `Habit checked in for ${checkDate}` } };
}

async function createHabit(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  if (!input.title) return { success: false, error: "title is required" };

  // Resolve frequency name to ID
  let frequencyId: string | null = null;
  if (input.frequency) {
    const { data: freq } = await config(supabase)
      .from("habit_frequencies")
      .select("id")
      .ilike("name", input.frequency as string)
      .single();
    frequencyId = freq?.id || null;
  }

  const { data, error } = await platform(supabase)
    .from("habits")
    .insert({
      title: input.title as string,
      description: (input.description as string) || null,
      frequency_id: frequencyId,
      target_count: input.target_count ? Number(input.target_count) : 1,
      owner_id: userId,
      started_on: new Date().toISOString().slice(0, 10),
    })
    .select("id, title")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { habit: data, message: `Habit "${data.title}" created` } };
}

// ── GOAL IMPLEMENTATIONS ──

async function listGoals(supabase: Supabase, input: Record<string, unknown>): Promise<ToolResult> {
  let query = platform(supabase)
    .from("goals")
    .select("id, title, description, status, progress_type, progress_value, target_value, current_value, unit, target_date, category:goal_categories(name, icon)")
    .order("target_date", { ascending: true, nullsFirst: false });

  if (input.status) query = query.eq("status", input.status as string);
  else query = query.eq("status", "active");

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { goals: data, count: data?.length || 0 } };
}

async function updateGoalProgress(supabase: Supabase, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.goal_id as string;
  if (!id) return { success: false, error: "goal_id is required" };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.progress_value !== undefined) updates.progress_value = Number(input.progress_value);
  if (input.current_value !== undefined) updates.current_value = Number(input.current_value);

  const { data, error } = await platform(supabase)
    .from("goals")
    .update(updates)
    .eq("id", id)
    .select("id, title, progress_value, target_value")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { goal: data, message: `Goal "${data.title}" progress updated` } };
}

// ── SHOPPING IMPLEMENTATIONS ──

async function listShopping(supabase: Supabase): Promise<ToolResult> {
  const { data, error } = await platform(supabase)
    .from("shopping_lists")
    .select("id, name, store, is_default, created_at")
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: { lists: data } };
}

async function getShoppingList(supabase: Supabase, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.list_id as string;
  if (!id) return { success: false, error: "list_id is required" };

  const { data, error } = await platform(supabase)
    .from("shopping_lists")
    .select("id, name, store, shopping_items(id, name, quantity, checked, category:shopping_categories(name))")
    .eq("id", id)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { list: data } };
}

async function addShoppingItems(supabase: Supabase, input: Record<string, unknown>): Promise<ToolResult> {
  const listId = input.list_id as string;
  const items = input.items as { name: string; quantity?: string }[];
  if (!listId || !items?.length) return { success: false, error: "list_id and items are required" };

  const inserts = items.slice(0, 50).map((item) => ({
    list_id: listId,
    name: item.name,
    quantity: item.quantity || null,
  }));

  const { data, error } = await platform(supabase)
    .from("shopping_items")
    .insert(inserts)
    .select("id, name, quantity");

  if (error) return { success: false, error: error.message };
  return { success: true, data: { items: data, message: `Added ${data?.length || 0} items` } };
}

// ── FINANCE IMPLEMENTATIONS ──

async function getSpendingSummary(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  // Delegate to the finance summary API logic
  const period = (input.period as string) || "month";
  const month = input.month as string;

  const params = new URLSearchParams({ period });
  if (month) params.set("month", month);

  // Build inline — we already have the supabase client with user auth
  // Reuse the summary calculation from the API route
  const now = new Date();
  let startDate: string;
  let endDate: string;

  if (period === "week") {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    startDate = weekStart.toISOString().slice(0, 10);
    endDate = now.toISOString().slice(0, 10);
  } else if (period === "year") {
    startDate = `${now.getFullYear()}-01-01`;
    endDate = now.toISOString().slice(0, 10);
  } else {
    const m = month || now.toISOString().slice(0, 7);
    startDate = `${m}-01`;
    const next = new Date(startDate);
    next.setMonth(next.getMonth() + 1);
    endDate = next.toISOString().slice(0, 10);
  }

  const { data: categories } = await config(supabase)
    .from("expense_categories")
    .select("id, name, slug, display_color, icon, is_income")
    .eq("active", true);

  const categoryMap = new Map((categories || []).map((c) => [c.id, c]));

  const { data: transactions } = await finance(supabase)
    .from("transactions")
    .select("amount, category_id, is_split_parent, pending")
    .eq("user_id", userId)
    .eq("excluded", false)
    .is("split_parent_id", null)
    .gte("transaction_date", startDate)
    .lt("transaction_date", endDate);

  const spending = new Map<string, number>();
  let totalSpending = 0;
  let totalIncome = 0;

  for (const tx of (transactions || [])) {
    const amount = Math.abs(Number(tx.amount));
    const cat = tx.category_id ? categoryMap.get(tx.category_id) : null;
    if (tx.pending || tx.is_split_parent) continue;
    if (cat?.is_income) {
      totalIncome += amount;
    } else {
      totalSpending += amount;
      if (tx.category_id) {
        spending.set(tx.category_id, (spending.get(tx.category_id) || 0) + amount);
      }
    }
  }

  const breakdown = Array.from(spending.entries())
    .map(([catId, amount]) => ({
      category: categoryMap.get(catId)?.name || "Unknown",
      icon: categoryMap.get(catId)?.icon || "",
      amount: Math.round(amount * 100) / 100,
      percent: totalSpending > 0 ? Math.round((amount / totalSpending) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    success: true,
    data: {
      period: `${startDate} to ${endDate}`,
      total_spending: Math.round(totalSpending * 100) / 100,
      total_income: Math.round(totalIncome * 100) / 100,
      net: Math.round((totalIncome - totalSpending) * 100) / 100,
      breakdown,
    },
  };
}

async function listTransactions(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const limit = Math.min(Number(input.limit) || 20, 50);

  let query = finance(supabase)
    .from("transactions")
    .select("id, amount, description, merchant_name, transaction_date, category_id, pending, reviewed, source")
    .eq("user_id", userId)
    .is("split_parent_id", null)
    .order("transaction_date", { ascending: false })
    .limit(limit);

  if (input.search) query = query.or(`merchant_name.ilike.%${input.search}%,description.ilike.%${input.search}%`);
  if (input.category) query = query.eq("category_id", input.category as string);
  if (input.reviewed !== undefined) query = query.eq("reviewed", input.reviewed as boolean);
  if (input.from) query = query.gte("transaction_date", input.from as string);
  if (input.to) query = query.lte("transaction_date", input.to as string);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  // Enrich with category names
  const catIds = [...new Set((data || []).map((t) => t.category_id).filter(Boolean))];
  let categoryMap = new Map<string, string>();
  if (catIds.length > 0) {
    const { data: cats } = await config(supabase)
      .from("expense_categories")
      .select("id, name, icon")
      .in("id", catIds);
    categoryMap = new Map((cats || []).map((c) => [c.id, `${c.icon} ${c.name}`]));
  }

  const enriched = (data || []).map((t) => ({
    ...t,
    category_name: t.category_id ? categoryMap.get(t.category_id) || null : null,
    amount: `$${Math.abs(Number(t.amount)).toFixed(2)}`,
  }));

  return { success: true, data: { transactions: enriched, count: enriched.length } };
}

async function categorizeTransaction(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const txId = input.transaction_id as string;
  const categoryId = input.category_id as string;
  if (!txId || !categoryId) return { success: false, error: "transaction_id and category_id are required" };

  const { data, error } = await finance(supabase)
    .from("transactions")
    .update({ category_id: categoryId, reviewed: true, updated_at: new Date().toISOString() })
    .eq("id", txId)
    .eq("user_id", userId)
    .select("id, merchant_name, description")
    .single();

  if (error) return { success: false, error: error.message };

  // Auto-create merchant rule
  if (data?.merchant_name) {
    const pattern = data.merchant_name.toUpperCase().replace(/\s*#\d+.*$/, "%");
    const { data: existing } = await finance(supabase)
      .from("merchant_rules")
      .select("id")
      .eq("merchant_pattern", pattern)
      .single();

    if (existing) {
      await finance(supabase)
        .from("merchant_rules")
        .update({ category_id: categoryId, confidence: "user_confirmed", updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await finance(supabase)
        .from("merchant_rules")
        .insert({ merchant_pattern: pattern, category_id: categoryId, created_by: userId, confidence: "user_confirmed" });
    }
  }

  return { success: true, data: { message: `Transaction categorized and merchant rule updated` } };
}

async function getBudgets(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const month = (input.month as string) || new Date().toISOString().slice(0, 7);

  const { data: budgets } = await finance(supabase)
    .from("budgets")
    .select("id, category_id, monthly_amount")
    .eq("user_id", userId)
    .is("effective_until", null);

  const { data: categories } = await config(supabase)
    .from("expense_categories")
    .select("id, name, icon")
    .eq("active", true);

  const categoryMap = new Map((categories || []).map((c) => [c.id, c]));

  // Calculate spending per category for the month
  const monthStart = `${month}-01`;
  const nextMonth = new Date(monthStart);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthEnd = nextMonth.toISOString().slice(0, 10);

  const { data: transactions } = await finance(supabase)
    .from("transactions")
    .select("amount, category_id, is_split_parent")
    .eq("user_id", userId)
    .eq("excluded", false)
    .eq("pending", false)
    .is("split_parent_id", null)
    .gte("transaction_date", monthStart)
    .lt("transaction_date", monthEnd);

  const spendingByCategory = new Map<string, number>();
  for (const tx of (transactions || [])) {
    if (tx.is_split_parent || !tx.category_id) continue;
    spendingByCategory.set(tx.category_id, (spendingByCategory.get(tx.category_id) || 0) + Math.abs(Number(tx.amount)));
  }

  const enriched = (budgets || []).map((b) => {
    const cat = categoryMap.get(b.category_id);
    const spent = spendingByCategory.get(b.category_id) || 0;
    return {
      category: cat ? `${cat.icon} ${cat.name}` : "Unknown",
      budget: `$${Number(b.monthly_amount).toFixed(2)}`,
      spent: `$${spent.toFixed(2)}`,
      remaining: `$${(Number(b.monthly_amount) - spent).toFixed(2)}`,
      percent_used: Math.round((spent / Number(b.monthly_amount)) * 100),
    };
  });

  return { success: true, data: { budgets: enriched, month } };
}

async function createBudget(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const categoryId = input.category_id as string;
  const monthlyAmount = Number(input.monthly_amount);
  if (!categoryId || !monthlyAmount || monthlyAmount <= 0) {
    return { success: false, error: "category_id and positive monthly_amount are required" };
  }

  // Soft-close existing budget for this category
  await finance(supabase)
    .from("budgets")
    .update({ effective_until: new Date().toISOString().slice(0, 10) })
    .eq("category_id", categoryId)
    .eq("user_id", userId)
    .is("effective_until", null);

  const { data, error } = await finance(supabase)
    .from("budgets")
    .insert({ category_id: categoryId, monthly_amount: monthlyAmount, user_id: userId })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  // Default alerts
  await finance(supabase)
    .from("budget_alerts")
    .insert([
      { budget_id: data.id, threshold_percent: 75, channel: "discord" },
      { budget_id: data.id, threshold_percent: 90, channel: "discord" },
    ]);

  return { success: true, data: { message: `Budget of $${monthlyAmount.toFixed(2)} created with alerts at 75% and 90%` } };
}

// ── FEEDBACK ──

async function submitFeedback(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const body = input.body as string;
  if (!body) return { success: false, error: "body is required" };

  const validTypes = ["bug", "feature_request", "improvement", "complaint"];
  const type = validTypes.includes(input.type as string) ? input.type as string : "improvement";

  const { data, error } = await platform(supabase)
    .from("feedback")
    .insert({
      submitted_by: userId,
      type,
      body: body.trim(),
      channel: "discord", // Agent interactions come through Discord or web
      priority: (input.priority as string) || "medium",
      tags: [],
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { feedback_id: data.id, message: "Feedback submitted" } };
}

// ── DASHBOARD ──

async function getDashboard(supabase: Supabase, userId: string): Promise<ToolResult> {
  const today = new Date().toISOString().slice(0, 10);

  // Tasks due today
  const { data: tasks } = await platform(supabase)
    .from("tasks")
    .select("id, title, due_date, priority:task_priorities(name, icon)")
    .eq("due_date", today)
    .not("status_id", "is", null)
    .limit(10);

  // Active goals
  const { data: goals } = await platform(supabase)
    .from("goals")
    .select("id, title, progress_value, target_value, target_date")
    .eq("status", "active")
    .eq("owner_id", userId)
    .limit(10);

  // Active habits with streaks
  const { data: habits } = await platform(supabase)
    .from("habits")
    .select("id, title, current_streak, last_check_in")
    .eq("status", "active")
    .eq("owner_id", userId)
    .limit(10);

  // Unread notifications count
  const { count: unreadCount } = await platform(supabase)
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);

  return {
    success: true,
    data: {
      today,
      tasks_due: tasks || [],
      active_goals: (goals || []).map((g) => ({
        ...g,
        progress: g.target_value ? `${Math.round((Number(g.progress_value || 0) / Number(g.target_value)) * 100)}%` : "N/A",
      })),
      habits: (habits || []).map((h) => ({
        ...h,
        checked_today: h.last_check_in === today,
      })),
      unread_notifications: unreadCount || 0,
    },
  };
}

// ── NOTIFICATIONS ──

async function getNotifications(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const limit = Math.min(Number(input.limit) || 10, 30);
  const unread = input.unread !== false;

  let query = platform(supabase)
    .from("notifications")
    .select("id, title, body, event_type, entity_type, read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unread) query = query.eq("read", false);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { notifications: data, count: data?.length || 0 } };
}

// ── CONFIG ──

async function getExpenseCategories(supabase: Supabase): Promise<ToolResult> {
  const { data, error } = await config(supabase)
    .from("expense_categories")
    .select("id, name, slug, icon, is_income")
    .eq("active", true)
    .order("sort_order");

  if (error) return { success: false, error: error.message };
  return { success: true, data: { categories: data } };
}
