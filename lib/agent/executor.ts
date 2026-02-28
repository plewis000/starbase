import { SupabaseClient } from "@supabase/supabase-js";
import { finance, config, platform } from "@/lib/supabase/schemas";
import { getHouseholdContext, getHouseholdMemberIds } from "@/lib/household";
import { sanitizeSearchInput } from "@/lib/validation";

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
        return await updateTask(supabase, userId, input);
      case "complete_task":
        return await completeTask(supabase, userId, input);

      // ── HABITS ──
      case "list_habits":
        return await listHabits(supabase, userId, input);
      case "check_in_habit":
        return await checkInHabit(supabase, userId, input);
      case "create_habit":
        return await createHabit(supabase, userId, input);

      // ── GOALS ──
      case "list_goals":
        return await listGoals(supabase, userId, input);
      case "update_goal_progress":
        return await updateGoalProgress(supabase, userId, input);

      // ── SHOPPING ──
      case "list_shopping":
        return await listShopping(supabase, userId);
      case "get_shopping_list":
        return await getShoppingList(supabase, userId, input);
      case "add_shopping_items":
        return await addShoppingItems(supabase, userId, input);

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

      // ── AI MEMORY ──
      case "recall_observations":
        return await recallObservations(supabase, userId, input);
      case "store_observation":
        return await storeObservation(supabase, userId, input);
      case "get_user_model":
        return await getUserModel(supabase, userId, input);

      // ── AI SUGGESTIONS ──
      case "get_suggestions":
        return await getSuggestions(supabase, userId, input);
      case "create_suggestion":
        return await createSuggestion(supabase, userId, input);

      // ── BEHAVIORAL AGGREGATES ──
      case "get_behavioral_summary":
        return await getBehavioralSummary(supabase, userId, input);

      // ── ONBOARDING ──
      case "get_onboarding_state":
        return await getOnboardingState(supabase, userId);
      case "start_onboarding":
        return await startOnboarding(supabase, userId, input);
      case "submit_onboarding_response":
        return await submitOnboardingResponse(supabase, userId, input);

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

  // Scope to household members
  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) return { success: false, error: "No household found" };
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  let query = platform(supabase)
    .from("tasks")
    .select("id, title, description, due_date, schedule_date, status:task_statuses(name, icon), priority:task_priorities(name, icon), assigned_to")
    .in("created_by", memberIds)
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
    const sanitized = sanitizeSearchInput(input.search as string);
    if (sanitized.length > 0) {
      query = query.or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
    }
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

async function updateTask(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.task_id as string;
  if (!id) return { success: false, error: "task_id is required" };

  // Verify task belongs to user's household
  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) return { success: false, error: "No household found" };
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const { data: taskCheck } = await platform(supabase).from("tasks").select("created_by").eq("id", id).single();
  if (!taskCheck || !memberIds.includes(taskCheck.created_by)) {
    return { success: false, error: "Task not found" };
  }

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

async function completeTask(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.task_id as string;
  if (!id) return { success: false, error: "task_id is required" };

  // Verify task belongs to user's household
  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) return { success: false, error: "No household found" };
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const { data: taskCheck } = await platform(supabase).from("tasks").select("created_by").eq("id", id).single();
  if (!taskCheck || !memberIds.includes(taskCheck.created_by)) {
    return { success: false, error: "Task not found" };
  }

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

async function listHabits(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  // Scope to household
  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) return { success: false, error: "No household found" };
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  let query = platform(supabase)
    .from("habits")
    .select("id, title, description, status, frequency:habit_frequencies(name), current_streak, longest_streak, last_check_in")
    .in("owner_id", memberIds)
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

async function listGoals(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  // Scope to household
  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) return { success: false, error: "No household found" };
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  let query = platform(supabase)
    .from("goals")
    .select("id, title, description, status, progress_type, progress_value, target_value, current_value, unit, target_date, category:goal_categories(name, icon)")
    .in("owner_id", memberIds)
    .order("target_date", { ascending: true, nullsFirst: false });

  if (input.status) query = query.eq("status", input.status as string);
  else query = query.eq("status", "active");

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { goals: data, count: data?.length || 0 } };
}

async function updateGoalProgress(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.goal_id as string;
  if (!id) return { success: false, error: "goal_id is required" };

  // Verify goal belongs to user's household
  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) return { success: false, error: "No household found" };
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const { data: goalCheck } = await platform(supabase).from("goals").select("owner_id").eq("id", id).single();
  if (!goalCheck || !memberIds.includes(goalCheck.owner_id)) {
    return { success: false, error: "Goal not found" };
  }

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

async function listShopping(supabase: Supabase, userId: string): Promise<ToolResult> {
  // Scope to household
  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) return { success: false, error: "No household found" };
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  const { data, error } = await platform(supabase)
    .from("shopping_lists")
    .select("id, name, store, is_default, created_at")
    .in("created_by", memberIds)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: { lists: data } };
}

async function getShoppingList(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const id = input.list_id as string;
  if (!id) return { success: false, error: "list_id is required" };

  // Verify list belongs to household
  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) return { success: false, error: "No household found" };
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  const { data, error } = await platform(supabase)
    .from("shopping_lists")
    .select("id, name, store, created_by, shopping_items(id, name, quantity, checked, category:shopping_categories(name))")
    .eq("id", id)
    .in("created_by", memberIds)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { list: data } };
}

async function addShoppingItems(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const listId = input.list_id as string;
  const items = input.items as { name: string; quantity?: string }[];
  if (!listId || !items?.length) return { success: false, error: "list_id and items are required" };

  // Verify list belongs to household
  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) return { success: false, error: "No household found" };
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const { data: listCheck } = await platform(supabase).from("shopping_lists").select("created_by").eq("id", listId).single();
  if (!listCheck || !memberIds.includes(listCheck.created_by)) {
    return { success: false, error: "Shopping list not found" };
  }

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

  if (input.search) {
    const sanitized = sanitizeSearchInput(input.search as string);
    if (sanitized.length > 0) {
      query = query.or(`merchant_name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
    }
  }
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

// ── AI MEMORY ──

async function recallObservations(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const limit = Math.min(Number(input.limit) || 10, 30);

  let query = platform(supabase)
    .from("ai_observations")
    .select("id, observation_type, content, confidence, source_layer, tags, created_at")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (input.type) {
    query = query.eq("observation_type", input.type as string);
  }
  if (input.layer) {
    query = query.eq("source_layer", input.layer as string);
  }
  if (input.search) {
    const sanitized = sanitizeSearchInput(input.search as string);
    if (sanitized.length > 0) {
      query = query.ilike("content", `%${sanitized}%`);
    }
  }

  query = query.order("created_at", { ascending: false }).limit(limit);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  if (!data || data.length === 0) {
    return { success: true, data: { observations: [], message: "No observations found matching those criteria." } };
  }

  return { success: true, data: { observations: data, count: data.length } };
}

async function storeObservation(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const observationType = input.observation_type as string;
  const content = input.content as string;
  if (!observationType || !content) {
    return { success: false, error: "observation_type and content are required" };
  }

  if (content.length > 5000) {
    return { success: false, error: "content must be 5000 characters or fewer" };
  }

  const validTypes = ["preference", "routine", "personality", "relationship", "goal", "boundary", "context", "feedback_pattern"];
  if (!validTypes.includes(observationType)) {
    return { success: false, error: `observation_type must be one of: ${validTypes.join(", ")}` };
  }

  const validLayers = ["declared", "observed", "inferred"];
  const layer = validLayers.includes(input.layer as string) ? input.layer as string : "observed";

  const confidence = Math.min(Math.max(Number(input.confidence) || 0.7, 0), 1);

  const { data, error } = await platform(supabase)
    .from("ai_observations")
    .insert({
      user_id: userId,
      observation_type: observationType,
      content: content.trim(),
      confidence,
      source_layer: layer,
      tags: Array.isArray(input.tags) ? (input.tags as string[]).slice(0, 10) : null,
    })
    .select("id, observation_type, content")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { observation: data, message: "Observation stored." } };
}

async function getUserModel(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  let query = platform(supabase)
    .from("user_model")
    .select("attribute_key, attribute_value, source_layer, confidence, version, updated_at")
    .eq("user_id", userId);

  if (input.attribute_key) {
    query = query.eq("attribute_key", input.attribute_key as string);
  }

  query = query.order("updated_at", { ascending: false });

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  if (!data || data.length === 0) {
    return { success: true, data: { attributes: [], message: "No user model data yet. Build it by storing observations over time." } };
  }

  return { success: true, data: { attributes: data, count: data.length } };
}

// ── AI SUGGESTIONS ──

async function getSuggestions(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const limit = Math.min(Number(input.limit) || 5, 20);
  const status = (input.status as string) || "pending";

  let query = platform(supabase)
    .from("ai_suggestions")
    .select("id, category, title, description, reasoning, priority, confidence, status, created_at, expires_at")
    .eq("user_id", userId)
    .eq("status", status)
    .order("priority", { ascending: false })
    .limit(limit);

  if (input.category) {
    query = query.eq("category", input.category as string);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: { suggestions: data || [], count: data?.length || 0 } };
}

async function createSuggestion(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const title = input.title as string;
  const description = input.description as string;
  const category = input.category as string;

  if (!title || !description || !category) {
    return { success: false, error: "category, title, and description are required" };
  }

  if (title.length > 300) return { success: false, error: "title must be 300 characters or fewer" };
  if (description.length > 2000) return { success: false, error: "description must be 2000 characters or fewer" };

  const validCategories = [
    "habit_adjustment", "goal_suggestion", "schedule_optimization",
    "delegation_suggestion", "gamification_tweak", "responsibility_rebalance",
    "boundary_suggestion", "reward_suggestion", "notification_optimization",
    "financial_insight", "general",
  ];
  if (!validCategories.includes(category)) {
    return { success: false, error: `category must be one of: ${validCategories.join(", ")}` };
  }

  const priority = Math.min(Math.max(Math.round(Number(input.priority) || 5), 1), 10);
  const confidence = Math.min(Math.max(Number(input.confidence) || 0.6, 0), 1);

  const { data, error } = await platform(supabase)
    .from("ai_suggestions")
    .insert({
      user_id: userId,
      category,
      title: title.trim(),
      description: description.trim(),
      reasoning: (input.reasoning as string)?.trim() || null,
      priority,
      confidence,
      status: "pending",
      source_observation_ids: Array.isArray(input.source_observation_ids)
        ? (input.source_observation_ids as string[]).slice(0, 20)
        : null,
    })
    .select("id, category, title")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { suggestion: data, message: `Suggestion "${title}" created.` } };
}

// ── BEHAVIORAL AGGREGATES ──

async function getBehavioralSummary(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const days = Math.min(Math.max(Number(input.days) || 7, 1), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);

  // Try behavioral_aggregates table first
  const { data: aggregates } = await platform(supabase)
    .from("behavioral_aggregates")
    .select("*")
    .eq("user_id", userId)
    .gte("date", sinceDate)
    .order("date", { ascending: false });

  if (aggregates && aggregates.length > 0) {
    // Summarize the aggregates
    const totals = {
      period: `Last ${days} days`,
      days_tracked: aggregates.length,
      tasks_created: aggregates.reduce((s, a) => s + (a.tasks_created || 0), 0),
      tasks_completed: aggregates.reduce((s, a) => s + (a.tasks_completed || 0), 0),
      habits_checked: aggregates.reduce((s, a) => s + (a.habits_checked || 0), 0),
      habits_missed: aggregates.reduce((s, a) => s + (a.habits_missed || 0), 0),
      xp_earned: aggregates.reduce((s, a) => s + (a.xp_earned || 0), 0),
      total_spent: aggregates.reduce((s, a) => s + (a.total_spent || 0), 0),
      avg_engagement_score: aggregates.length > 0
        ? Math.round(aggregates.reduce((s, a) => s + (a.engagement_score || 0), 0) / aggregates.length)
        : null,
      peak_hours: aggregates.filter(a => a.peak_activity_hour != null)
        .map(a => a.peak_activity_hour),
    };

    return { success: true, data: totals };
  }

  // Fallback: compute from raw engagement events
  const { data: events } = await platform(supabase)
    .from("engagement_events")
    .select("event_type, feature, created_at")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (!events || events.length === 0) {
    return { success: true, data: { message: "No behavioral data yet. Activity will build up over time.", period: `Last ${days} days` } };
  }

  // Aggregate by event type
  const eventCounts = new Map<string, number>();
  const featureCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();

  for (const e of events) {
    eventCounts.set(e.event_type, (eventCounts.get(e.event_type) || 0) + 1);
    if (e.feature) featureCounts.set(e.feature, (featureCounts.get(e.feature) || 0) + 1);
    const hour = new Date(e.created_at).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }

  const peakHour = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    success: true,
    data: {
      period: `Last ${days} days`,
      total_events: events.length,
      event_breakdown: Object.fromEntries(eventCounts),
      feature_usage: Object.fromEntries(featureCounts),
      peak_activity_hour: peakHour ? peakHour[0] : null,
    },
  };
}

// ── ONBOARDING ──

async function getOnboardingState(supabase: Supabase, userId: string): Promise<ToolResult> {
  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) {
    return { success: true, data: { phase: "no_household", needs_household: true, message: "User has no household yet." } };
  }

  const { data: state } = await platform(supabase)
    .from("onboarding_state")
    .select("*")
    .eq("user_id", userId)
    .eq("household_id", ctx.household_id)
    .single();

  if (!state) {
    return {
      success: true,
      data: {
        phase: "not_started",
        household_id: ctx.household_id,
        message: "New crawler detected. Onboarding has not been initiated. Use start_onboarding to begin registration.",
      },
    };
  }

  // Interview phase — return current question
  if (state.current_phase === "interview") {
    const { data: questions } = await config(supabase)
      .from("onboarding_questions")
      .select("question_key, question_text, help_text, sort_order")
      .eq("phase", "interview")
      .eq("active", true)
      .order("sort_order");

    const currentQuestion = questions && questions.length > state.current_question_index
      ? questions[state.current_question_index]
      : null;

    // Get already-answered questions
    const { data: responses } = await platform(supabase)
      .from("onboarding_responses")
      .select("question_key")
      .eq("onboarding_id", state.id);

    return {
      success: true,
      data: {
        phase: "interview",
        track: state.track,
        current_question: currentQuestion,
        question_number: state.current_question_index + 1,
        total_questions: questions?.length || 0,
        answered_keys: (responses || []).map(r => r.question_key),
        progress: questions?.length
          ? Math.round((state.current_question_index / questions.length) * 100)
          : 0,
      },
    };
  }

  // Quick-start active users — check for deferred questions
  if (state.track === "quick" && state.current_phase === "active") {
    const { data: responses } = await platform(supabase)
      .from("onboarding_responses")
      .select("question_key")
      .eq("onboarding_id", state.id);

    const answeredKeys = new Set((responses || []).map(r => r.question_key));

    const { data: allQuestions } = await config(supabase)
      .from("onboarding_questions")
      .select("question_key, question_text, help_text")
      .eq("phase", "interview")
      .eq("active", true)
      .order("sort_order");

    const unanswered = (allQuestions || []).filter(q => !answeredKeys.has(q.question_key));

    return {
      success: true,
      data: {
        phase: "active",
        track: "quick",
        fully_onboarded: unanswered.length === 0,
        deferred_question: unanswered.length > 0 ? unanswered[0] : null,
        deferred_remaining: unanswered.length,
        message: unanswered.length > 0
          ? "User is active but has unanswered getting-to-know-you questions. Ask ONE per conversation naturally."
          : "User is fully onboarded.",
      },
    };
  }

  return {
    success: true,
    data: {
      phase: state.current_phase,
      track: state.track,
      message: `User is in ${state.current_phase} phase.`,
    },
  };
}

async function startOnboarding(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) {
    return { success: false, error: "No household found. User needs a household first." };
  }

  // Check if already started
  const { data: existing } = await platform(supabase)
    .from("onboarding_state")
    .select("id, current_phase, track")
    .eq("user_id", userId)
    .eq("household_id", ctx.household_id)
    .single();

  if (existing) {
    return {
      success: true,
      data: {
        already_started: true,
        phase: existing.current_phase,
        track: existing.track,
        message: "Onboarding already in progress.",
      },
    };
  }

  const track = (input.track as string) === "full" ? "full" : "quick";
  const displayName = input.display_name as string | undefined;

  if (displayName) {
    await platform(supabase)
      .from("household_members")
      .update({ display_name: displayName })
      .eq("user_id", userId)
      .eq("household_id", ctx.household_id);
  }

  if (track === "quick") {
    const { data: state, error } = await platform(supabase)
      .from("onboarding_state")
      .insert({
        user_id: userId,
        household_id: ctx.household_id,
        current_phase: "active",
        current_question_index: 0,
        track: "quick",
        interview_completed_at: null,
        metadata: { quick_start: true, started_via: "agent" },
      })
      .select("id, current_phase, track")
      .single();

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: {
        state,
        track: "quick",
        message: "Crawler registered via quick-start. They're active now — ask getting-to-know-you questions naturally over the next few conversations.",
      },
    };
  }

  // Full interview track
  const { data: state, error } = await platform(supabase)
    .from("onboarding_state")
    .insert({
      user_id: userId,
      household_id: ctx.household_id,
      current_phase: "interview",
      current_question_index: 0,
      track: "full",
      metadata: { started_via: "agent" },
    })
    .select("id, current_phase, track")
    .single();

  if (error) return { success: false, error: error.message };

  // Fetch first question
  const { data: questions } = await config(supabase)
    .from("onboarding_questions")
    .select("question_key, question_text, help_text")
    .eq("phase", "interview")
    .eq("active", true)
    .order("sort_order")
    .limit(1);

  return {
    success: true,
    data: {
      state,
      track: "full",
      first_question: questions?.[0] || null,
      total_questions: 10,
      message: "Full interview started. Ask each question conversationally — don't interrogate.",
    },
  };
}

async function submitOnboardingResponse(supabase: Supabase, userId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const questionKey = input.question_key as string;
  const response = input.response as string;
  if (!questionKey || !response) {
    return { success: false, error: "question_key and response are required" };
  }

  if (response.length > 5000) {
    return { success: false, error: "response must be 5000 characters or fewer" };
  }

  const ctx = await getHouseholdContext(supabase, userId);
  if (!ctx) return { success: false, error: "No household found" };

  const { data: state } = await platform(supabase)
    .from("onboarding_state")
    .select("*")
    .eq("user_id", userId)
    .eq("household_id", ctx.household_id)
    .single();

  if (!state) return { success: false, error: "Onboarding not started" };

  // Allow submissions in interview phase OR for deferred questions in active phase
  const isInterview = state.current_phase === "interview";
  const isDeferred = state.track === "quick" && state.current_phase === "active";

  if (!isInterview && !isDeferred) {
    return { success: false, error: "Not in a phase that accepts responses" };
  }

  // Check if this question was already answered
  const { data: existingResponse } = await platform(supabase)
    .from("onboarding_responses")
    .select("id")
    .eq("onboarding_id", state.id)
    .eq("question_key", questionKey)
    .single();

  if (existingResponse) {
    return { success: true, data: { already_answered: true, message: "This question was already answered." } };
  }

  // Fetch question text from config
  const { data: questionDef } = await config(supabase)
    .from("onboarding_questions")
    .select("question_text")
    .eq("question_key", questionKey)
    .single();

  // Store the response
  const { error: saveErr } = await platform(supabase)
    .from("onboarding_responses")
    .insert({
      user_id: userId,
      onboarding_id: state.id,
      question_key: questionKey,
      question_text: questionDef?.question_text || questionKey,
      raw_response: response.trim(),
      phase: isInterview ? "interview" : "micro_checkin",
      channel: "discord",
      extracted_data: {},
      confidence: null,
      reviewed_by_user: false,
    });

  if (saveErr) return { success: false, error: saveErr.message };

  // For interview track: advance to next question
  if (isInterview) {
    const { data: questions } = await config(supabase)
      .from("onboarding_questions")
      .select("question_key, question_text, help_text, sort_order")
      .eq("phase", "interview")
      .eq("active", true)
      .order("sort_order");

    const nextIndex = state.current_question_index + 1;
    const isLastQuestion = !questions || nextIndex >= questions.length;

    const stateUpdate: Record<string, unknown> = {
      current_question_index: nextIndex,
      updated_at: new Date().toISOString(),
    };

    if (isLastQuestion) {
      stateUpdate.current_phase = "observation";
      stateUpdate.interview_completed_at = new Date().toISOString();
      stateUpdate.observation_started_at = new Date().toISOString();
      const observationEnd = new Date();
      observationEnd.setDate(observationEnd.getDate() + 7);
      stateUpdate.observation_ends_at = observationEnd.toISOString();
    }

    await platform(supabase)
      .from("onboarding_state")
      .update(stateUpdate)
      .eq("id", state.id);

    // Generate observations when interview completes
    if (isLastQuestion) {
      const { generateObservationsFromOnboarding } = await import("@/lib/observation-generator");
      const obsResult = await generateObservationsFromOnboarding(supabase, userId, ctx.household_id, state.id);

      return {
        success: true,
        data: {
          interview_complete: true,
          observations_generated: obsResult.created,
          message: "Interview complete! Observations generated. The System has registered this crawler.",
          next_phase: "observation",
        },
      };
    }

    const nextQuestion = questions![nextIndex];
    return {
      success: true,
      data: {
        saved: true,
        next_question: nextQuestion,
        question_number: nextIndex + 1,
        total_questions: questions!.length,
        progress: Math.round((nextIndex / questions!.length) * 100),
      },
    };
  }

  // For deferred questions: generate observation immediately for this single response
  const { generateObservationsFromOnboarding } = await import("@/lib/observation-generator");
  const obsResult = await generateObservationsFromOnboarding(supabase, userId, ctx.household_id, state.id);

  return {
    success: true,
    data: {
      saved: true,
      deferred: true,
      observations_generated: obsResult.created,
      message: "Got it — learned something new about this crawler.",
    },
  };
}
