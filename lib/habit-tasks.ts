/**
 * Habit-Task Adapter
 *
 * Habits are now tasks with is_habit=true. This module provides helpers
 * for creating habit-tasks and converting between task and habit shapes.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { platform, config } from "@/lib/supabase/schemas";

// ---- RRULE BUILDERS ----

/**
 * Build an RRULE string from a frequency config row.
 */
export async function buildRRuleFromFrequency(
  supabase: SupabaseClient,
  frequencyId: string,
  specificDays?: number[] | null
): Promise<string> {
  const { data: freq } = await config(supabase)
    .from("habit_frequencies")
    .select("target_type, default_target, slug")
    .eq("id", frequencyId)
    .single();

  if (!freq) return "FREQ=DAILY";

  // Map JS day numbers (0=Sun..6=Sat) to RRULE BYDAY codes
  const numToDayCode = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

  switch (freq.target_type) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly": {
      if (specificDays && specificDays.length > 0) {
        const byDay = specificDays
          .map((d) => numToDayCode[d] || "MO")
          .join(",");
        return `FREQ=WEEKLY;BYDAY=${byDay}`;
      }
      return "FREQ=WEEKLY";
    }
    case "monthly":
      return "FREQ=MONTHLY";
    default:
      return "FREQ=DAILY";
  }
}

/**
 * Infer frequency name from an RRULE string.
 */
export function inferFrequencyName(rrule?: string | null): string {
  if (!rrule) return "Daily";
  if (rrule.includes("FREQ=DAILY")) return "Daily";
  if (rrule.includes("FREQ=WEEKLY")) return "Weekly";
  if (rrule.includes("FREQ=MONTHLY")) return "Monthly";
  return "Daily";
}

/**
 * Infer target_type from RRULE.
 */
export function inferTargetType(rrule?: string | null): "daily" | "weekly" | "monthly" {
  if (!rrule) return "daily";
  if (rrule.includes("FREQ=WEEKLY")) return "weekly";
  if (rrule.includes("FREQ=MONTHLY")) return "monthly";
  return "daily";
}

// ---- TASK → HABIT SHAPE ----

/**
 * Convert a task row to a habit-compatible shape for API responses.
 */
export function taskToHabit(task: Record<string, unknown>): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.completed_at ? "retired" : "active",
    current_streak: task.streak_current || 0,
    longest_streak: task.streak_longest || 0,
    total_completions: task.total_completions || 0,
    owner_id: Array.isArray(task.owner_ids) ? (task.owner_ids as string[])[0] : task.assigned_to,
    started_on: task.start_date || (task.created_at as string)?.split("T")[0],
    frequency: { name: inferFrequencyName(task.recurrence_rule as string) },
    category: null, // habits-as-tasks don't use habit categories
    time_preference: null,
    source: "manual",
    created_at: task.created_at,
    updated_at: task.updated_at,
    recurrence_rule: task.recurrence_rule,
  };
}

// ---- QUERY HELPERS ----

/**
 * Get the default "To Do" status_id for creating habit-tasks.
 */
export async function getDefaultStatusId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await config(supabase)
    .from("task_statuses")
    .select("id")
    .eq("is_done", false)
    .order("sort_order")
    .limit(1)
    .single();
  return data?.id || null;
}

/**
 * Get today's completed habit-task IDs for a user.
 */
export async function getCheckedTodayIds(
  supabase: SupabaseClient,
  taskIds: string[],
  userId: string
): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const { data } = await platform(supabase)
    .from("task_completions")
    .select("task_id")
    .in("task_id", taskIds)
    .eq("completed_by", userId)
    .eq("completed_date", todayStr);
  return new Set((data || []).map((c: Record<string, unknown>) => c.task_id as string));
}

/**
 * Count completions per habit-task in last N days.
 */
export async function getCompletionCounts(
  supabase: SupabaseClient,
  taskIds: string[],
  userId: string,
  days: number
): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;

  const { data } = await platform(supabase)
    .from("task_completions")
    .select("task_id, completed_date")
    .in("task_id", taskIds)
    .eq("completed_by", userId)
    .gte("completed_date", sinceStr);

  const counts = new Map<string, number>();
  for (const row of data || []) {
    const tid = row.task_id as string;
    counts.set(tid, (counts.get(tid) || 0) + 1);
  }
  return counts;
}
