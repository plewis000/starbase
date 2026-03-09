/**
 * Habit-Task Helpers
 *
 * Habits are tasks with is_habit=true. This module provides shared
 * utility functions for RRULE inference and task status lookups.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/supabase/schemas";

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
 * Infer target_type from RRULE (for streak calculation).
 */
export function inferTargetType(rrule?: string | null): "daily" | "weekly" | "monthly" {
  if (!rrule) return "daily";
  if (rrule.includes("FREQ=WEEKLY")) return "weekly";
  if (rrule.includes("FREQ=MONTHLY")) return "monthly";
  return "daily";
}

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
