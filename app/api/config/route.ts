import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { config } from "@/lib/supabase/schemas";

// =============================================================
// GET /api/config — Fetch all config lookup tables
// Returns statuses, priorities, types, efforts, locations
// Used by form components to render dropdowns with real IDs
// =============================================================
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    statuses, priorities, types, efforts, locations,
    goalCategories, goalTimeframes, habitFrequencies, habitTimePreferences,
  ] = await Promise.all([
    config(supabase).from("task_statuses").select("id, name, slug, color, sort_order").order("sort_order"),
    config(supabase).from("task_priorities").select("id, name, slug, color, sort_order").order("sort_order"),
    config(supabase).from("task_types").select("id, name, slug, icon").order("name"),
    config(supabase).from("effort_levels").select("id, name, slug, sort_order").order("sort_order"),
    config(supabase).from("location_contexts").select("id, name, slug").order("name"),
    config(supabase).from("goal_categories").select("id, name, slug, display_color, icon, sort_order").eq("active", true).order("sort_order"),
    config(supabase).from("goal_timeframes").select("id, name, slug, duration_days, sort_order").eq("active", true).order("sort_order"),
    config(supabase).from("habit_frequencies").select("id, name, slug, target_type, default_target, sort_order").eq("active", true).order("sort_order"),
    config(supabase).from("habit_time_preferences").select("id, name, slug, sort_order").eq("active", true).order("sort_order"),
  ]);

  return NextResponse.json({
    // Task config
    statuses: statuses.data || [],
    priorities: priorities.data || [],
    types: types.data || [],
    efforts: efforts.data || [],
    locations: locations.data || [],
    // Goal config
    goal_categories: goalCategories.data || [],
    goal_timeframes: goalTimeframes.data || [],
    // Habit config
    habit_frequencies: habitFrequencies.data || [],
    habit_time_preferences: habitTimePreferences.data || [],
  });
}
