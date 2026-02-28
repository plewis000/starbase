import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";

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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { command } = body;
  if (!command || typeof command !== "string") {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const raw = command.trim();
  const result = await executeCommand(supabase, user.id, raw);

  return NextResponse.json({ response: result.response, data: result.data, free: true });
}

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
      .select("id, title, priority, status, due_date, completed_at")
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

    const lines = tasks.map((t) => {
      const pri = t.priority === "critical" ? "🔴" : t.priority === "high" ? "🟠" : t.priority === "medium" ? "🟡" : "⚪";
      const due = t.due_date ? ` (due ${t.due_date})` : "";
      return `${pri} ${t.title}${due}`;
    });
    return { response: `**Open Tasks** (${tasks.length})\n\n${lines.join("\n")}`, data: tasks };
  }

  // --- /task add ---
  if (lower.startsWith("task add ") || lower.startsWith("add task ") || lower.startsWith("new task ")) {
    const title = input.replace(/^(task add|add task|new task)\s+/i, "").trim();
    if (!title) return { response: "What's the task? Usage: `/task add Buy groceries`" };

    const { data: task, error } = await platform(supabase)
      .from("tasks")
      .insert({ title, created_by: userId, assigned_to: userId, status: "todo", priority: "medium" })
      .select("id, title")
      .single();

    if (error) return { response: `Failed to create task: ${error.message}` };
    return { response: `Task created: **${task.title}**`, data: task };
  }

  // --- /task done ---
  if (lower.startsWith("task done ")) {
    const search = input.replace(/^task done\s+/i, "").trim();
    if (!search) return { response: "Which task? Usage: `/task done Buy groceries`" };

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
    await platform(supabase)
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", task.id);

    return { response: `Completed: **${task.title}** ✓`, data: task };
  }

  // --- /habits ---
  if (lower === "habits") {
    const today = new Date().toISOString().split("T")[0];
    const { data: habits } = await platform(supabase)
      .from("habits")
      .select("id, name, current_streak, best_streak, status")
      .eq("owner_id", userId)
      .eq("status", "active")
      .order("name");

    if (!habits || habits.length === 0) return { response: "No active habits. The Training Grounds are empty." };

    // Check which are done today
    const { data: checkins } = await platform(supabase)
      .from("habit_check_ins")
      .select("habit_id")
      .eq("user_id", userId)
      .eq("check_date", today);

    const doneIds = new Set((checkins || []).map((c) => c.habit_id));

    const lines = habits.map((h) => {
      const done = doneIds.has(h.id) ? "✅" : "⬜";
      const streak = h.current_streak ? ` (🔥 ${h.current_streak}d)` : "";
      return `${done} ${h.name}${streak}`;
    });

    const completed = habits.filter((h) => doneIds.has(h.id)).length;
    return { response: `**Today's Habits** (${completed}/${habits.length})\n\n${lines.join("\n")}`, data: habits };
  }

  // --- /habit check ---
  if (lower.startsWith("habit check ")) {
    const search = input.replace(/^habit check\s+/i, "").trim();
    if (!search) return { response: "Which habit? Usage: `/habit check Morning workout`" };

    const { data: habits } = await platform(supabase)
      .from("habits")
      .select("id, name, current_streak")
      .eq("owner_id", userId)
      .eq("status", "active")
      .ilike("name", `%${search}%`)
      .limit(5);

    if (!habits || habits.length === 0) return { response: `No active habit matching "${search}".` };
    if (habits.length > 1) {
      const matches = habits.map((h) => `• ${h.name}`).join("\n");
      return { response: `Multiple matches — be more specific:\n${matches}` };
    }

    const habit = habits[0];
    const today = new Date().toISOString().split("T")[0];

    // Check if already done today
    const { data: existing } = await platform(supabase)
      .from("habit_check_ins")
      .select("id")
      .eq("habit_id", habit.id)
      .eq("user_id", userId)
      .eq("check_date", today)
      .limit(1);

    if (existing && existing.length > 0) {
      return { response: `Already checked in **${habit.name}** today.` };
    }

    await platform(supabase)
      .from("habit_check_ins")
      .insert({ habit_id: habit.id, user_id: userId, check_date: today });

    // Update streak
    const newStreak = (habit.current_streak || 0) + 1;
    await platform(supabase)
      .from("habits")
      .update({ current_streak: newStreak, last_checked_date: today })
      .eq("id", habit.id);

    return { response: `Checked in: **${habit.name}** ✓ (🔥 ${newStreak} day streak)`, data: habit };
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

    if (!budgets || budgets.length === 0) return { response: "No budgets configured. Visit The Vault to set them up." };

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
      .select("id, title, status, progress_pct, target_date")
      .eq("owner_id", userId)
      .in("status", ["active", "in_progress"])
      .order("target_date", { ascending: true })
      .limit(10);

    if (!goals || goals.length === 0) return { response: "No active goals. Visit the War Room to set some." };

    const lines = goals.map((g) => {
      const pct = g.progress_pct ? `${Math.round(g.progress_pct)}%` : "0%";
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

    if (!lists || lists.length === 0) return { response: "No active shopping lists. The Quartermaster has nothing to report." };

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
      .from("habits")
      .select("name, current_streak, best_streak")
      .eq("owner_id", userId)
      .eq("status", "active")
      .gt("current_streak", 0)
      .order("current_streak", { ascending: false })
      .limit(10);

    let response = `**Streaks**\n\n🔑 Login: ${profile?.login_streak || 0}d (best: ${profile?.longest_login_streak || 0}d)`;

    if (habits && habits.length > 0) {
      response += "\n\n" + habits.map((h) =>
        `🔥 ${h.name}: ${h.current_streak}d (best: ${h.best_streak || h.current_streak}d)`
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
        .from("habit_check_ins")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("check_date", today),
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
