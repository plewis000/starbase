import { SupabaseClient } from "@supabase/supabase-js";
import { config, platform } from "@/lib/supabase/schemas";

// ---- TYPES ----

export type GoalHabitLookups = Awaited<ReturnType<typeof getGoalHabitLookups>>;

// ---- CONFIG LOOKUPS ----

/**
 * Fetch all goals/habits config tables for cross-schema enrichment.
 * Same pattern as task-enrichment.ts — parallel fetch, Map-based O(1) lookup.
 */
export async function getGoalHabitLookups(supabase: SupabaseClient) {
  const [categories, timeframes, frequencies, timePrefs, users] = await Promise.all([
    config(supabase).from("goal_categories").select("*").eq("active", true).order("sort_order"),
    config(supabase).from("goal_timeframes").select("*").eq("active", true).order("sort_order"),
    config(supabase).from("habit_frequencies").select("*").eq("active", true).order("sort_order"),
    config(supabase).from("habit_time_preferences").select("*").eq("active", true).order("sort_order"),
    platform(supabase).from("users").select("id, full_name, email, avatar_url"),
  ]);

  return {
    categories: new Map((categories.data || []).map((c) => [c.id, c])),
    timeframes: new Map((timeframes.data || []).map((t) => [t.id, t])),
    frequencies: new Map((frequencies.data || []).map((f) => [f.id, f])),
    timePrefs: new Map((timePrefs.data || []).map((p) => [p.id, p])),
    users: new Map((users.data || []).map((u) => [u.id, u])),
  };
}

// ---- GOAL ENRICHMENT ----

/**
 * Enrich a single goal with resolved config data.
 */
export function enrichGoal(goal: Record<string, unknown>, lookups: GoalHabitLookups): Record<string, unknown> {
  return {
    ...goal,
    category: goal.category_id ? lookups.categories.get(goal.category_id as string) || null : null,
    timeframe: goal.timeframe_id ? lookups.timeframes.get(goal.timeframe_id as string) || null : null,
    owner: goal.owner_id ? lookups.users.get(goal.owner_id as string) || null : null,
  };
}

/**
 * Enrich an array of goals.
 */
export function enrichGoals(goals: Record<string, unknown>[], lookups: GoalHabitLookups): Record<string, unknown>[] {
  return goals.map((g) => enrichGoal(g, lookups));
}

// ---- HABIT ENRICHMENT ----

/**
 * Enrich a single habit with resolved config data.
 */
export function enrichHabit(habit: Record<string, unknown>, lookups: GoalHabitLookups): Record<string, unknown> {
  return {
    ...habit,
    category: habit.category_id ? lookups.categories.get(habit.category_id as string) || null : null,
    frequency: habit.frequency_id ? lookups.frequencies.get(habit.frequency_id as string) || null : null,
    time_preference: habit.time_preference_id
      ? lookups.timePrefs.get(habit.time_preference_id as string) || null
      : null,
    owner: habit.owner_id ? lookups.users.get(habit.owner_id as string) || null : null,
  };
}

/**
 * Enrich an array of habits.
 */
export function enrichHabits(habits: Record<string, unknown>[], lookups: GoalHabitLookups): Record<string, unknown>[] {
  return habits.map((h) => enrichHabit(h, lookups));
}
