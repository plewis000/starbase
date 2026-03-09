import { SupabaseClient } from "@supabase/supabase-js";
import { platform } from "@/lib/supabase/schemas";

// ---- TYPES ----

interface GoalProgressResult {
  progress_value: number; // 0-100
  method: string;         // how it was calculated
  details: Record<string, unknown>;
}

// ---- PROGRESS CALCULATORS ----

/**
 * Calculate progress for a goal based on its progress_type.
 * Returns a 0-100 percentage.
 */
export async function calculateGoalProgress(
  supabase: SupabaseClient,
  goalId: string,
  progressType: string,
  targetValue: number | null,
  currentValue: number | null
): Promise<GoalProgressResult> {
  switch (progressType) {
    case "manual":
      return calculateManualProgress(currentValue, targetValue);

    case "milestone":
      return await calculateMilestoneProgress(supabase, goalId);

    case "habit_driven":
      return await calculateHabitDrivenProgress(supabase, goalId);

    case "task_driven":
      return await calculateTaskDrivenProgress(supabase, goalId);

    default:
      return { progress_value: 0, method: "unknown", details: {} };
  }
}

// Manual: user-set progress or value/target ratio
function calculateManualProgress(
  currentValue: number | null,
  targetValue: number | null
): GoalProgressResult {
  if (targetValue && currentValue != null) {
    const pct = Math.min(100, Math.round((currentValue / targetValue) * 100));
    return {
      progress_value: pct,
      method: "value_ratio",
      details: { current: currentValue, target: targetValue },
    };
  }
  return {
    progress_value: 0,
    method: "manual",
    details: { note: "No target value set; update progress_value directly" },
  };
}

// Milestone: completed milestones / total milestones
async function calculateMilestoneProgress(
  supabase: SupabaseClient,
  goalId: string
): Promise<GoalProgressResult> {
  const { data: milestones } = await platform(supabase)
    .from("goal_milestones")
    .select("id, completed_at")
    .eq("goal_id", goalId);

  if (!milestones || milestones.length === 0) {
    return {
      progress_value: 0,
      method: "milestone",
      details: { total: 0, completed: 0, note: "No milestones defined" },
    };
  }

  const completed = milestones.filter(
    (m: { completed_at: string | null }) => m.completed_at !== null
  ).length;
  const total = milestones.length;
  const pct = Math.round((completed / total) * 100);

  return {
    progress_value: pct,
    method: "milestone",
    details: { total, completed },
  };
}

// Habit-driven: weighted average of linked habit completion rates (30-day)
async function calculateHabitDrivenProgress(
  supabase: SupabaseClient,
  goalId: string
): Promise<GoalProgressResult> {
  // Get linked habits with weights
  // Habit-tasks linked to this goal via goal_tasks (with is_habit=true)
  const { data: links } = await platform(supabase)
    .from("goal_tasks")
    .select("task_id, weight")
    .eq("goal_id", goalId);

  if (!links || links.length === 0) {
    return {
      progress_value: 0,
      method: "habit_driven",
      details: { note: "No habits linked to this goal" },
    };
  }

  // Get habit-task details
  const taskIds = links.map((l: { task_id: string }) => l.task_id);
  const { data: habits } = await platform(supabase)
    .from("tasks")
    .select("id, streak_current, start_date, created_at")
    .eq("is_habit", true)
    .in("id", taskIds);

  if (!habits || habits.length === 0) {
    return {
      progress_value: 0,
      method: "habit_driven",
      details: { note: "Linked habits not found" },
    };
  }

  // Get 30-day completion counts per habit-task
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(thirtyDaysAgo.getDate()).padStart(2, "0")}`;

  const { data: recentCompletions } = await platform(supabase)
    .from("task_completions")
    .select("task_id, completed_date")
    .in("task_id", taskIds)
    .gte("completed_date", cutoff);

  // Count completions per task
  const countsByHabit = new Map<string, number>();
  for (const ci of recentCompletions || []) {
    const current = countsByHabit.get(ci.task_id) || 0;
    countsByHabit.set(ci.task_id, current + 1);
  }

  // Weighted average: each habit's 30-day completion rate * weight
  let totalWeight = 0;
  let weightedSum = 0;

  for (const link of links) {
    const count = countsByHabit.get(link.task_id) || 0;
    // 30 days = max possible daily completions
    const rate = Math.min(100, Math.round((count / 30) * 100));
    weightedSum += rate * (link.weight || 1.0);
    totalWeight += (link.weight || 1.0);
  }

  const pct = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return {
    progress_value: Math.min(100, pct),
    method: "habit_driven",
    details: {
      linked_habits: links.length,
      habit_rates: Object.fromEntries(
        links.map((l: { task_id: string; weight: number }) => [
          l.task_id,
          {
            completions_30d: countsByHabit.get(l.task_id) || 0,
            weight: l.weight,
          },
        ])
      ),
    },
  };
}

// Task-driven: completed linked tasks / total linked tasks
async function calculateTaskDrivenProgress(
  supabase: SupabaseClient,
  goalId: string
): Promise<GoalProgressResult> {
  const { data: links } = await platform(supabase)
    .from("goal_tasks")
    .select("task_id")
    .eq("goal_id", goalId);

  if (!links || links.length === 0) {
    return {
      progress_value: 0,
      method: "task_driven",
      details: { total: 0, completed: 0, note: "No tasks linked" },
    };
  }

  const taskIds = links.map((l: { task_id: string }) => l.task_id);
  const { data: tasks } = await platform(supabase)
    .from("tasks")
    .select("id, status_id, completed_at")
    .in("id", taskIds);

  if (!tasks || tasks.length === 0) {
    return {
      progress_value: 0,
      method: "task_driven",
      details: { total: links.length, completed: 0 },
    };
  }

  const completed = tasks.filter(
    (t: { completed_at: string | null }) => t.completed_at !== null
  ).length;
  const total = tasks.length;
  const pct = Math.round((completed / total) * 100);

  return {
    progress_value: pct,
    method: "task_driven",
    details: { total, completed },
  };
}

/**
 * Recalculate and persist goal progress.
 * Called when milestones complete, habits check in, or linked tasks complete.
 */
export async function recalculateAndUpdateGoalProgress(
  supabase: SupabaseClient,
  goalId: string
): Promise<GoalProgressResult> {
  // Fetch the goal to get its progress type
  const { data: goal } = await platform(supabase)
    .from("goals")
    .select("id, progress_type, target_value, current_value")
    .eq("id", goalId)
    .single();

  if (!goal) {
    return { progress_value: 0, method: "error", details: { note: "Goal not found" } };
  }

  const result = await calculateGoalProgress(
    supabase,
    goalId,
    goal.progress_type,
    goal.target_value,
    goal.current_value
  );

  // Update the goal's progress_value
  const updateData: Record<string, unknown> = {
    progress_value: result.progress_value,
    updated_at: new Date().toISOString(),
  };

  // If progress hits 100, auto-complete the goal
  if (result.progress_value >= 100 && goal.progress_type !== "manual") {
    updateData.status = "completed";
    updateData.completed_at = new Date().toISOString();
  }

  await platform(supabase)
    .from("goals")
    .update(updateData)
    .eq("id", goalId);

  return result;
}
