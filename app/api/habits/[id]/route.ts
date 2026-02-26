import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getGoalHabitLookups, enrichHabit } from "@/lib/goal-habit-enrichment";
import { logActivity, logFieldChanges } from "@/lib/activity-log";
import { getStreakData } from "@/lib/streak-engine";
import { getCheckInHistory } from "@/lib/streak-engine";

// ---- GET: Single habit with full details ----

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: habit, error } = await platform(supabase)
    .from("habits")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (error || !habit) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }

  // Fetch check-in history (last 90 days for heatmap)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const startDate = ninetyDaysAgo.toISOString().split("T")[0];
  const endDate = new Date().toISOString().split("T")[0];

  const [checkInHistory, goalLinksRes, activityRes] = await Promise.all([
    getCheckInHistory(supabase, id, startDate, endDate),
    platform(supabase)
      .from("goal_habits")
      .select("goal_id, weight")
      .eq("habit_id", id),
    platform(supabase)
      .from("activity_log")
      .select("*")
      .eq("entity_type", "habit")
      .eq("entity_id", id)
      .order("performed_at", { ascending: false })
      .limit(20),
  ]);

  // Fetch linked goal details
  const goalIds = (goalLinksRes.data || []).map((l: Record<string, unknown>) => l.goal_id as string);
  let linkedGoals: Record<string, unknown>[] = [];
  if (goalIds.length > 0) {
    const { data } = await platform(supabase)
      .from("goals")
      .select("id, title, status, progress_value")
      .in("id", goalIds);
    linkedGoals = data || [];
  }

  // Enrich
  const lookups = await getGoalHabitLookups(supabase);
  const enriched = enrichHabit(habit, lookups);

  // Get frequency details for streak context
  const freq = lookups.frequencies.get(habit.frequency_id);
  const targetType = freq ? (freq as Record<string, unknown>).target_type as string : "daily";

  return NextResponse.json({
    habit: {
      ...enriched,
      check_in_history: checkInHistory,
      linked_goals: linkedGoals,
      activity: activityRes.data || [],
      streak_context: {
        target_type: targetType,
        target_count: habit.target_count,
      },
    },
  });
}

// ---- PATCH: Update a habit ----

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Fetch current for diff
  const { data: currentHabit } = await platform(supabase)
    .from("habits")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!currentHabit) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }

  const body = await request.json();

  const allowedFields = [
    "title", "description", "category_id", "frequency_id", "target_count",
    "time_preference_id", "specific_days", "status",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  // Validate specific_days
  if (updates.specific_days && Array.isArray(updates.specific_days)) {
    const validDays = (updates.specific_days as number[]).every((d) => d >= 0 && d <= 6);
    if (!validDays) {
      return NextResponse.json(
        { error: "specific_days must be array of 0-6 (Sun-Sat)" },
        { status: 400 }
      );
    }
  }

  // Handle status transitions
  if (updates.status === "paused" && currentHabit.status !== "paused") {
    updates.paused_at = new Date().toISOString();
  }
  if (updates.status === "retired" && currentHabit.status !== "retired") {
    updates.retired_at = new Date().toISOString();
  }
  if (updates.status === "active" && currentHabit.status === "paused") {
    updates.paused_at = null;
  }

  updates.updated_at = new Date().toISOString();

  const { data: updated, error } = await platform(supabase)
    .from("habits")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logFieldChanges(supabase, "habit", id, user.id, currentHabit, updates).catch(console.error);

  const lookups = await getGoalHabitLookups(supabase);
  const enriched = enrichHabit(updated, lookups);

  return NextResponse.json({ habit: enriched });
}

// ---- DELETE: Retire a habit (soft delete) ----

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await platform(supabase)
    .from("habits")
    .update({
      status: "retired",
      retired_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "habit",
    entity_id: id,
    action: "retired",
    performed_by: user.id,
  }).catch(console.error);

  return NextResponse.json({ success: true });
}
