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
  const cleaned = rrule.replace(/^RRULE:/i, "");
  const parts = Object.fromEntries(cleaned.split(";").map((p) => p.split("=")));
  const freq = parts.FREQ;
  const interval = parseInt(parts.INTERVAL || "1");

  if (freq === "YEARLY") return interval === 1 ? "Yearly" : `Every ${interval} years`;
  if (freq === "MONTHLY") {
    if (interval === 3) return "Quarterly";
    if (interval === 6) return "Biannual";
    if (interval === 1) return "Monthly";
    return `Every ${interval} months`;
  }
  if (freq === "WEEKLY") {
    if (interval === 2) return "Biweekly";
    if (interval === 1) return "Weekly";
    return `Every ${interval} weeks`;
  }
  if (freq === "DAILY") {
    if (interval === 1) return "Daily";
    return `Every ${interval} days`;
  }
  return "Daily";
}

/**
 * Infer target_type from RRULE (for streak calculation).
 * Note: yearly maps to "monthly" since the streak engine only supports daily/weekly/monthly.
 */
export function inferTargetType(rrule?: string | null): "daily" | "weekly" | "monthly" {
  if (!rrule) return "daily";
  const cleaned = rrule.replace(/^RRULE:/i, "");
  if (cleaned.includes("FREQ=YEARLY")) return "monthly";
  if (cleaned.includes("FREQ=WEEKLY")) return "weekly";
  if (cleaned.includes("FREQ=MONTHLY")) return "monthly";
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
