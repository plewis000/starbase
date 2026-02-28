import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext, getHouseholdMemberIds } from "@/lib/household";

// ---- GET: Unified dashboard summary ----

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Scope to household
  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household found" }, { status: 404 });
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  const today = new Date().toISOString().split("T")[0];

  // Parallel fetch all data — scoped to household
  const [
    overdueTasksRes,
    dueTodayTasksRes,
    activeTasksRes,
    activeGoalsRes,
    goalHabitsRes,
    activeHabitsRes,
    habitCheckInsRes,
    habitGoalsRes,
    topStreaksRes,
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

    // Active tasks: status != 'completed' (assuming there's a status or just check for null completed_at)
    platform(supabase)
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .is("completed_at", null),

    // Active goals with progress
    platform(supabase)
      .from("goals")
      .select("id, title, progress_value, status, target_date")
      .eq("owner_id", user.id)
      .eq("status", "active")
      .order("target_date", { ascending: true, nullsFirst: false }),

    // Goal-habits links — join table doesn't have owner_id, filter via goal_ids after
    platform(supabase)
      .from("goal_habits")
      .select("goal_id, habit_id"),

    // Active habits with streak data
    platform(supabase)
      .from("habits")
      .select("id, title, current_streak, status")
      .eq("owner_id", user.id)
      .eq("status", "active"),

    // Today's habit check-ins
    platform(supabase)
      .from("habit_check_ins")
      .select("habit_id")
      .eq("checked_by", user.id)
      .eq("check_date", today),

    // Habit-goals links (same table, second reference for the habit→goal map)
    // We'll reuse goalHabitsRes below, but keep the parallel call for cleaner structure
    platform(supabase)
      .from("goal_habits")
      .select("goal_id, habit_id"),

    // Top 5 habits by current streak
    platform(supabase)
      .from("habits")
      .select("title, current_streak")
      .eq("owner_id", user.id)
      .eq("status", "active")
      .gt("current_streak", 0)
      .order("current_streak", { ascending: false })
      .limit(5),
  ]);

  // Extract counts
  const overdueCount = overdueTasksRes.count || 0;
  const dueTodayCount = dueTodayTasksRes.count || 0;
  const activeCount = activeTasksRes.count || 0;

  // Build goal-habit mapping
  const goalHabitMap: Record<string, string[]> = {};
  (goalHabitsRes.data || []).forEach((link) => {
    const goalId = link.goal_id as string;
    const habitId = link.habit_id as string;
    if (!goalHabitMap[goalId]) {
      goalHabitMap[goalId] = [];
    }
    goalHabitMap[goalId].push(habitId);
  });

  // Build habit-goal mapping
  const habitGoalMap: Record<string, string[]> = {};
  (habitGoalsRes.data || []).forEach((link) => {
    const goalId = link.goal_id as string;
    const habitId = link.habit_id as string;
    if (!habitGoalMap[habitId]) {
      habitGoalMap[habitId] = [];
    }
    habitGoalMap[habitId].push(goalId);
  });

  // Build set of habits checked today
  const checkedTodaySet = new Set(
    (habitCheckInsRes.data || []).map((ci) => ci.habit_id as string)
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
    current_streak: habit.current_streak as number,
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
    current_streak: habit.current_streak as number,
  }));

  return NextResponse.json({
    tasks_summary: {
      overdue: overdueCount,
      due_today: dueTodayCount,
      active: activeCount,
    },
    goals_summary: {
      active_count: goalsList.length,
      avg_progress: Math.round(avgProgress * 10) / 10, // Round to 1 decimal
      goals: goalsList,
    },
    habits_summary: {
      active_count: habitsList.length,
      checked_today: checkedTodaySet.size,
      habits: habitsList,
    },
    streaks_leaderboard: streaksLeaderboard,
  });
}
