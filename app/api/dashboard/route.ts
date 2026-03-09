import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { platform, config } from "@/lib/supabase/schemas";
import { getHouseholdContext, getHouseholdMemberIds } from "@/lib/household";

// ---- GET: Unified dashboard summary ----

export const GET = withUser(async (_request, { supabase, user }) => {
  // Scope to household
  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household found" }, { status: 404 });

  const householdMemberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const today = new Date().toISOString().split("T")[0];

  // Parallel fetch all data — scoped to household
  // Calculate end of week (Sunday)
  const todayDate = new Date(today);
  const endOfWeek = new Date(todayDate);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  const endOfWeekStr = endOfWeek.toISOString().split("T")[0];

  const [
    overdueTasksRes,
    dueTodayTasksRes,
    activeTasksRes,
    completedTodayRes,
    dueThisWeekRes,
    inProgressRes,
    activeGoalsRes,
    goalHabitsRes,
    activeHabitsRes,
    habitCheckInsRes,
    habitGoalsRes,
    topStreaksRes,
    recentActivityRes,
  ] = await Promise.all([
    // Overdue tasks: due_date < today AND completed_at IS NULL
    platform(supabase)
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .lt("due_date", today)
      .is("completed_at", null),

    // Tasks due today: due_date = today AND completed_at IS NULL
    platform(supabase)
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .eq("due_date", today)
      .is("completed_at", null),

    // Active tasks
    platform(supabase)
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .is("completed_at", null),

    // Completed today
    platform(supabase)
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .gte("completed_at", `${today}T00:00:00`)
      .lt("completed_at", `${today}T23:59:59.999`),

    // Due this week
    platform(supabase)
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .gte("due_date", today)
      .lte("due_date", endOfWeekStr)
      .is("completed_at", null),

    // In Progress (tasks with "In Progress" status)
    platform(supabase)
      .from("tasks")
      .select("id, status_id", { count: "exact", head: false })
      .eq("assigned_to", user.id)
      .is("completed_at", null),

    // Active goals with progress
    platform(supabase)
      .from("goals")
      .select("id, title, progress_value, status, target_date")
      .eq("owner_id", user.id)
      .eq("status", "active")
      .order("target_date", { ascending: true, nullsFirst: false }),

    // Goal-task links (habits are now tasks)
    platform(supabase)
      .from("goal_tasks")
      .select("goal_id, task_id"),

    // Active habits (tasks with is_habit=true)
    platform(supabase)
      .from("tasks")
      .select("id, title, streak_current")
      .eq("is_habit", true)
      .contains("owner_ids", [user.id])
      .is("completed_at", null),

    // Today's habit completions
    platform(supabase)
      .from("task_completions")
      .select("task_id")
      .eq("completed_by", user.id)
      .eq("completed_date", today),

    // (removed — reusing goalHabitsRes for both directions)
    Promise.resolve({ data: null }),

    // Top 5 habit-tasks by streak
    platform(supabase)
      .from("tasks")
      .select("title, streak_current")
      .eq("is_habit", true)
      .contains("owner_ids", [user.id])
      .is("completed_at", null)
      .gt("streak_current", 0)
      .order("streak_current", { ascending: false })
      .limit(5),

    // Recent household activity (last 10 meaningful actions)
    platform(supabase)
      .from("activity_log")
      .select("id, entity_type, action, performed_by, created_at, metadata")
      .in("performed_by", householdMemberIds)
      .in("action", ["created", "completed", "checked_in"])
      .in("entity_type", ["task", "habit_check_in", "goal"])
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Extract counts
  const overdueCount = overdueTasksRes.count || 0;
  const dueTodayCount = dueTodayTasksRes.count || 0;
  const activeCount = activeTasksRes.count || 0;
  const completedTodayCount = completedTodayRes.count || 0;
  const dueThisWeekCount = dueThisWeekRes.count || 0;

  // Count in-progress tasks by looking up the status name
  const statusLookupRes = await config(supabase)
    .from("task_statuses")
    .select("id")
    .eq("name", "In Progress")
    .single();
  const inProgressStatusId = statusLookupRes.data?.id;
  const inProgressCount = inProgressStatusId
    ? (inProgressRes.data || []).filter((t: any) => t.status_id === inProgressStatusId).length
    : 0;

  // Build goal-habit mapping (habits are now tasks linked via goal_tasks)
  const goalHabitMap: Record<string, string[]> = {};
  (goalHabitsRes.data || []).forEach((link) => {
    const goalId = link.goal_id as string;
    const taskId = link.task_id as string;
    if (!goalHabitMap[goalId]) {
      goalHabitMap[goalId] = [];
    }
    goalHabitMap[goalId].push(taskId);
  });

  // Build habit-goal mapping (reverse of above)
  const habitGoalMap: Record<string, string[]> = {};
  (goalHabitsRes.data || []).forEach((link) => {
    const goalId = link.goal_id as string;
    const taskId = link.task_id as string;
    if (!habitGoalMap[taskId]) {
      habitGoalMap[taskId] = [];
    }
    habitGoalMap[taskId].push(goalId);
  });

  // Build set of habits checked today
  const checkedTodaySet = new Set(
    (habitCheckInsRes.data || []).map((ci) => ci.task_id as string)
  );

  // Build goals summary list
  const goalsList = (activeGoalsRes.data || []).map((goal) => ({
    id: goal.id as string,
    title: goal.title as string,
    progress_value: goal.progress_value as number,
    status: goal.status as string,
    target_date: goal.target_date as string,
    linked_habit_ids: goalHabitMap[goal.id as string] || [],
  }));

  // Build habits summary list
  const habitsList = (activeHabitsRes.data || []).map((habit) => ({
    id: habit.id as string,
    title: habit.title as string,
    current_streak: (habit.streak_current || 0) as number,
    checked_today: checkedTodaySet.has(habit.id as string),
    linked_goal_ids: habitGoalMap[habit.id as string] || [],
  }));

  // Calculate average goal progress
  const avgProgress =
    goalsList.length > 0
      ? goalsList.reduce((sum, g) => sum + g.progress_value, 0) / goalsList.length
      : 0;

  // Streaks leaderboard
  const streaksLeaderboard = (topStreaksRes.data || []).map((habit) => ({
    title: habit.title as string,
    current_streak: (habit.streak_current || 0) as number,
  }));

  // Get member names for activity feed
  const { data: memberProfiles } = await platform(supabase)
    .from("household_members")
    .select("user_id, display_name, user:user_id(full_name)")
    .eq("household_id", ctx.household_id);

  const nameMap = new Map<string, string>();
  for (const m of memberProfiles || []) {
    const name = m.display_name || (m.user as any)?.full_name || "Unknown";
    nameMap.set(m.user_id as string, name);
  }

  // Build activity feed
  const activityFeed = (recentActivityRes.data || []).map((entry: any) => {
    const performerName = nameMap.get(entry.performed_by) || "Someone";
    const isCurrentUser = entry.performed_by === user.id;
    let description = "";
    const meta = entry.metadata || {};

    if (entry.entity_type === "task" && entry.action === "created") {
      description = `created a task`;
    } else if (entry.entity_type === "task" && entry.action === "completed") {
      description = `completed a task`;
    } else if (entry.entity_type === "habit_check_in") {
      description = `checked in on a habit`;
    } else if (entry.entity_type === "goal" && entry.action === "created") {
      description = `set a new goal`;
    } else if (entry.entity_type === "goal" && entry.action === "completed") {
      description = `completed a goal!`;
    } else {
      description = `${entry.action} a ${entry.entity_type.replace(/_/g, " ")}`;
    }

    return {
      id: entry.id,
      performer: isCurrentUser ? "You" : performerName,
      is_current_user: isCurrentUser,
      description,
      entity_type: entry.entity_type,
      action: entry.action,
      created_at: entry.created_at,
    };
  });

  return NextResponse.json({
    tasks_summary: {
      overdue: overdueCount,
      due_today: dueTodayCount,
      active: activeCount,
      completed_today: completedTodayCount,
      due_this_week: dueThisWeekCount,
      in_progress: inProgressCount,
    },
    goals_summary: {
      active_count: goalsList.length,
      avg_progress: Math.round(avgProgress * 10) / 10,
      goals: goalsList,
    },
    habits_summary: {
      active_count: habitsList.length,
      checked_today: checkedTodaySet.size,
      habits: habitsList,
    },
    streaks_leaderboard: streaksLeaderboard,
    recent_activity: activityFeed,
  });
});
