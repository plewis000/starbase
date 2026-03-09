import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withUser } from "@/lib/api/withAuth";
import { platform, config } from "@/lib/supabase/schemas";
import { sanitizeSearchInput } from "@/lib/validation";

interface CommandResult {
  response: string;
  data?: unknown;
}

const COMMANDS: Record<string, { description: string; usage: string; aliases?: string[] }> = {
  help:      { description: "Show all available commands", usage: "/help" },
  tasks:     { description: "List your tasks (today or all open)", usage: "/tasks [today|all|overdue]" },
  "task add":  { description: "Create a new task", usage: '/task add Buy groceries', aliases: ["add task", "new task"] },
  "task done": { description: "Complete a task by title match", usage: "/task done Buy groceries" },
  habits:    { description: "Show today's habits and streaks", usage: "/habits" },
  "habit check": { description: "Check in to a habit", usage: "/habit check Morning workout" },
  xp:        { description: "Show your crawler profile and XP", usage: "/xp" },
  budget:    { description: "Show budget summary for current month", usage: "/budget" },
  goals:     { description: "List active goals and progress", usage: "/goals" },
  shopping:  { description: "Show active shopping lists", usage: "/shopping" },
  streak:    { description: "Show your login and habit streaks", usage: "/streak" },
  stats:     { description: "Show your daily stats", usage: "/stats" },
};

export const POST = withUser(async (request: NextRequest, { supabase, user }) => {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { command } = body;
  if (!command || typeof command !== "string") {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const raw = command.trim();
  const result = await executeCommand(supabase, user.id, raw);

  return NextResponse.json({ response: result.response, data: result.data, free: true });
});

async function executeCommand(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  raw: string,
): Promise<CommandResult> {
  // Strip leading /
  const input = raw.startsWith("/") ? raw.slice(1).trim() : raw.trim();
  const lower = input.toLowerCase();

  // --- /help ---
  if (lower === "help" || lower === "commands" || lower === "?") {
    const lines = Object.entries(COMMANDS).map(
      ([, cmd]) => `\`${cmd.usage}\` — ${cmd.description}`
    );
    return {
      response: `**Available Commands** (all free — no AI cost)\n\n${lines.join("\n")}\n\nAnything without a \`/\` prefix goes to Zev (AI).`,
    };
  }

  // --- /tasks ---
  if (lower.startsWith("tasks")) {
    const filter = lower.replace("tasks", "").trim();
    let query = platform(supabase)
      .from("tasks")
      .select("id, title, due_date, completed_at, priority_id, status_id")
      .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
      .is("completed_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(15);

    if (filter === "today") {
      const today = new Date().toISOString().split("T")[0];
      query = query.eq("due_date", today);
    } else if (filter === "overdue") {
      const today = new Date().toISOString().split("T")[0];
      query = query.lt("due_date", today);
    }

    const { data: tasks } = await query;
    if (!tasks || tasks.length === 0) {
      return { response: filter === "today" ? "No tasks due today. Suspiciously quiet." : "No open tasks. The System is skeptical." };
    }

    // Enrich with priority names from config schema (cross-schema FK join not supported)
    const priIds = [...new Set(tasks.map((t: any) => t.priority_id).filter(Boolean))];
    let priMap = new Map<string, string>();
    if (priIds.length > 0) {
      const { data: priorities } = await config(supabase).from("task_priorities").select("id, name").in("id", priIds);
      priMap = new Map((priorities || []).map(p => [p.id, p.name]));
    }

    const lines = tasks.map((t: any) => {
      const priName = (priMap.get(t.priority_id) || "").toLowerCase();
      const pri = priName === "critical" ? "🔴" : priName === "high" ? "🟠" : priName === "medium" ? "🟡" : "⚪";
      const due = t.due_date ? ` (due ${t.due_date})` : "";
      return `${pri} ${t.title}${due}`;
    });
    return { response: `**Open Tasks** (${tasks.length})\n\n${lines.join("\n")}`, data: tasks };
  }

  // --- /task add ---
  if (lower.startsWith("task add ") || lower.startsWith("add task ") || lower.startsWith("new task ")) {
    const title = input.replace(/^(task add|add task|new task)\s+/i, "").trim();
    if (!title) return { response: "What's the task? Usage: `/task add Buy groceries`" };

    // Look up default status and priority IDs
    const [{ data: defaultStatus }, { data: defaultPriority }] = await Promise.all([
      config(supabase).from("task_statuses").select("id").eq("sort_order", 0).limit(1).single(),
      config(supabase).from("task_priorities").select("id").eq("name", "Medium").limit(1).single(),
    ]);

    const { data: task, error } = await platform(supabase)
      .from("tasks")
      .insert({
        title,
        created_by: userId,
        assigned_to: userId,
        status_id: defaultStatus?.id,
        priority_id: defaultPriority?.id,
      })
      .select("id, title")
      .single();

    if (error) { console.error(error.message); return { response: "Failed to create task" }; }
    return { response: `Task created: **${task.title}**`, data: task };
  }

  // --- /task done ---
  if (lower.startsWith("task done ")) {
    const rawSearch = input.replace(/^task done\s+/i, "").trim();
    if (!rawSearch) return { response: "Which task? Usage: `/task done Buy groceries`" };
    const search = sanitizeSearchInput(rawSearch);

    const { data: tasks } = await platform(supabase)
      .from("tasks")
      .select("id, title")
      .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
      .is("completed_at", null)
      .ilike("title", `%${search}%`)
      .limit(5);

    if (!tasks || tasks.length === 0) return { response: `No open task matching "${search}".` };
    if (tasks.length > 1) {
      const matches = tasks.map((t) => `• ${t.title}`).join("\n");
      return { response: `Multiple matches — be more specific:\n${matches}` };
    }

    const task = tasks[0];
    // Look up "Done" or "Shipped" status ID
    const { data: doneStatus } = await config(supabase)
      .from("task_statuses")
      .select("id")
      .ilike("name", "%done%")
      .limit(1)
      .single();

    await platform(supabase)
      .from("tasks")
      .update({ status_id: doneStatus?.id, completed_at: new Date().toISOString() })
      .eq("id", task.id);

    return { response: `Completed: **${task.title}** ✓`, data: task };
  }

  // --- /habits ---
  if (lower === "habits") {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const { data: habits } = await platform(supabase)
      .from("tasks")
      .select("id, title, streak_current, streak_longest")
      .eq("is_habit", true)
      .contains("owner_ids", [userId])
      .is("completed_at", null)
      .order("title");

    if (!habits || habits.length === 0) return { response: "No active habits." };

    // Check which are done today
    const habitIds = habits.map(h => h.id);
    const { data: completions } = await platform(supabase)
      .from("task_completions")
      .select("task_id")
      .in("task_id", habitIds)
      .eq("completed_by", userId)
      .eq("completed_date", today);

    const doneIds = new Set((completions || []).map((c) => c.task_id));

    const lines = habits.map((h) => {
      const done = doneIds.has(h.id) ? "✅" : "⬜";
      const streak = h.streak_current ? ` (🔥 ${h.streak_current}d)` : "";
      return `${done} ${h.title}${streak}`;
    });

    const completed = habits.filter((h) => doneIds.has(h.id)).length;
    return { response: `**Today's Habits** (${completed}/${habits.length})\n\n${lines.join("\n")}`, data: habits };
  }

  // --- /habit check ---
  if (lower.startsWith("habit check ")) {
    const rawHabitSearch = input.replace(/^habit check\s+/i, "").trim();
    if (!rawHabitSearch) return { response: "Which habit? Usage: `/habit check Morning workout`" };
    const habitSearch = sanitizeSearchInput(rawHabitSearch);

    const { data: habits } = await platform(supabase)
      .from("tasks")
      .select("id, title, streak_current, recurrence_rule, start_date")
      .eq("is_habit", true)
      .contains("owner_ids", [userId])
      .is("completed_at", null)
      .ilike("title", `%${habitSearch}%`)
      .limit(5);

    if (!habits || habits.length === 0) return { response: `No active habit matching "${rawHabitSearch}".` };
    if (habits.length > 1) {
      const matches = habits.map((h) => `• ${h.title}`).join("\n");
      return { response: `Multiple matches — be more specific:\n${matches}` };
    }

    const habit = habits[0];
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Check if already done today
    const { data: existing } = await platform(supabase)
      .from("task_completions")
      .select("id")
      .eq("task_id", habit.id)
      .eq("completed_by", userId)
      .eq("completed_date", today)
      .limit(1);

    if (existing && existing.length > 0) {
      return { response: `Already checked in **${habit.title}** today.` };
    }

    await platform(supabase)
      .from("task_completions")
      .insert({ task_id: habit.id, completed_by: userId, completed_date: today, completed_at: new Date().toISOString() });

    // Recalculate streak using proper engine
    const { recalculateTaskStreak } = await import("@/lib/streak-engine");
    const { inferTargetType } = await import("@/lib/habit-tasks");
    const targetType = inferTargetType(habit.recurrence_rule);
    const streakResult = await recalculateTaskStreak(supabase, habit.id, 1, targetType);

    return { response: `Checked in: **${habit.title}** ✓ (🔥 ${streakResult.current_streak} day streak)`, data: habit };
  }

  // --- /xp ---
  if (lower === "xp" || lower === "profile" || lower === "level") {
    const { data: profile } = await platform(supabase)
      .from("crawler_profiles")
      .select("crawler_name, total_xp, current_level, xp_to_next_level, login_streak, longest_login_streak")
      .eq("user_id", userId)
      .single();

    if (!profile) return { response: "No crawler profile found. Log in again to create one." };

    const floor = Math.floor((profile.current_level - 1) / 10) + 1;
    return {
      response: `**${profile.crawler_name || "Crawler"}** — Level ${profile.current_level} (Floor ${floor})\n` +
        `XP: ${profile.total_xp.toLocaleString()} (${profile.xp_to_next_level.toLocaleString()} to next level)\n` +
        `Login streak: 🔥 ${profile.login_streak}d (best: ${profile.longest_login_streak}d)`,
      data: profile,
    };
  }

  // --- /budget ---
  if (lower === "budget") {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    const { data: budgets } = await supabase
      .schema("finance")
      .from("budgets")
      .select("category, amount_limit")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (!budgets || budgets.length === 0) return { response: "No budgets configured. Set them up in Budget." };

    const { data: transactions } = await supabase
      .schema("finance")
      .from("transactions")
      .select("category, amount")
      .eq("user_id", userId)
      .gte("date", monthStart)
      .lte("date", monthEnd);

    const spendByCategory: Record<string, number> = {};
    for (const t of transactions || []) {
      spendByCategory[t.category] = (spendByCategory[t.category] || 0) + Math.abs(t.amount);
    }

    const lines = budgets.map((b) => {
      const spent = spendByCategory[b.category] || 0;
      const pct = b.amount_limit > 0 ? Math.round((spent / b.amount_limit) * 100) : 0;
      const indicator = pct >= 100 ? "🔴" : pct >= 75 ? "🟠" : "🟢";
      return `${indicator} **${b.category}**: $${spent.toFixed(0)} / $${b.amount_limit.toFixed(0)} (${pct}%)`;
    });

    return { response: `**Budget — ${now.toLocaleDateString("en-US", { month: "long" })}**\n\n${lines.join("\n")}`, data: budgets };
  }

  // --- /goals ---
  if (lower === "goals") {
    const { data: goals } = await platform(supabase)
      .from("goals")
      .select("id, title, status, progress_value, target_date")
      .eq("owner_id", userId)
      .in("status", ["active"])
      .order("target_date", { ascending: true })
      .limit(10);

    if (!goals || goals.length === 0) return { response: "No active goals. Create some in Goals & Habits." };

    const lines = goals.map((g) => {
      const pct = g.progress_value ? `${Math.round(g.progress_value)}%` : "0%";
      const due = g.target_date ? ` (target: ${g.target_date})` : "";
      return `• ${g.title} — ${pct}${due}`;
    });

    return { response: `**Active Goals** (${goals.length})\n\n${lines.join("\n")}`, data: goals };
  }

  // --- /shopping ---
  if (lower === "shopping") {
    const { data: lists } = await supabase
      .schema("household")
      .from("shopping_lists")
      .select("id, name, created_at")
      .is("completed_at", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!lists || lists.length === 0) return { response: "No active shopping lists." };

    const listSummaries = [];
    for (const list of lists) {
      const { count } = await supabase
        .schema("household")
        .from("shopping_items")
        .select("id", { count: "exact", head: true })
        .eq("list_id", list.id)
        .is("purchased_at", null);
      listSummaries.push(`• **${list.name}** — ${count || 0} items remaining`);
    }

    return { response: `**Shopping Lists**\n\n${listSummaries.join("\n")}`, data: lists };
  }

  // --- /streak ---
  if (lower === "streak" || lower === "streaks") {
    const { data: profile } = await platform(supabase)
      .from("crawler_profiles")
      .select("login_streak, longest_login_streak")
      .eq("user_id", userId)
      .single();

    const { data: habits } = await platform(supabase)
      .from("tasks")
      .select("title, streak_current, streak_longest")
      .eq("is_habit", true)
      .contains("owner_ids", [userId])
      .is("completed_at", null)
      .gt("streak_current", 0)
      .order("streak_current", { ascending: false })
      .limit(10);

    let response = `**Streaks**\n\n🔑 Login: ${profile?.login_streak || 0}d (best: ${profile?.longest_login_streak || 0}d)`;

    if (habits && habits.length > 0) {
      response += "\n\n" + habits.map((h) =>
        `🔥 ${h.title}: ${h.streak_current}d (best: ${h.streak_longest || h.streak_current}d)`
      ).join("\n");
    } else {
      response += "\n\nNo active habit streaks.";
    }

    return { response };
  }

  // --- /stats ---
  if (lower === "stats" || lower === "today") {
    const today = new Date().toISOString().split("T")[0];

    const [tasksResult, habitsResult, xpResult] = await Promise.all([
      platform(supabase)
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
        .gte("completed_at", `${today}T00:00:00`),
      platform(supabase)
        .from("task_completions")
        .select("id", { count: "exact", head: true })
        .eq("completed_by", userId)
        .eq("completed_date", today),
      platform(supabase)
        .from("xp_ledger")
        .select("amount")
        .eq("user_id", userId)
        .gte("created_at", `${today}T00:00:00`),
    ]);

    const tasksCompleted = tasksResult.count || 0;
    const habitsChecked = habitsResult.count || 0;
    const xpToday = (xpResult.data || []).reduce((sum, r) => sum + r.amount, 0);

    return {
      response: `**Today's Stats**\n\n` +
        `Tasks completed: ${tasksCompleted}\n` +
        `Habits checked: ${habitsChecked}\n` +
        `XP earned: ${xpToday}`,
    };
  }

  // --- Unknown command ---
  return { response: `Unknown command: \`/${input.split(" ")[0]}\`. Type \`/help\` to see what's available.` };
}
