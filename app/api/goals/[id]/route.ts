import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getGoalHabitLookups, enrichGoal } from "@/lib/goal-habit-enrichment";
import { logActivity, logFieldChanges } from "@/lib/activity-log";
import { recalculateAndUpdateGoalProgress } from "@/lib/goal-progress";

// ---- GET: Single goal with full details ----

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

  const { data: goal, error } = await platform(supabase)
    .from("goals")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (error || !goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  // Fetch all related data in parallel
  const [milestonesRes, habitLinksRes, taskLinksRes, subgoalsRes, activityRes] = await Promise.all([
    platform(supabase)
      .from("goal_milestones")
      .select("*")
      .eq("goal_id", id)
      .order("sort_order"),
    platform(supabase)
      .from("goal_habits")
      .select("*")
      .eq("goal_id", id),
    platform(supabase)
      .from("goal_tasks")
      .select("*")
      .eq("goal_id", id),
    platform(supabase)
      .from("goals")
      .select("id, title, status, progress_value")
      .eq("parent_goal_id", id),
    platform(supabase)
      .from("activity_log")
      .select("*")
      .eq("entity_type", "goal")
      .eq("entity_id", id)
      .order("performed_at", { ascending: false })
      .limit(20),
  ]);

  // Fetch linked habit details
  const habitIds = (habitLinksRes.data || []).map((l: Record<string, unknown>) => l.habit_id as string);
  let linkedHabits: Record<string, unknown>[] = [];
  if (habitIds.length > 0) {
    const { data } = await platform(supabase)
      .from("habits")
      .select("id, title, current_streak, longest_streak, total_completions, status")
      .in("id", habitIds);
    linkedHabits = data || [];
  }

  // Fetch linked task details
  const taskIds = (taskLinksRes.data || []).map((l: Record<string, unknown>) => l.task_id as string);
  let linkedTasks: Record<string, unknown>[] = [];
  if (taskIds.length > 0) {
    const { data } = await platform(supabase)
      .from("tasks")
      .select("id, title, status_id, completed_at")
      .in("id", taskIds);
    linkedTasks = data || [];
  }

  // Enrich
  const lookups = await getGoalHabitLookups(supabase);
  const enriched = enrichGoal(goal, lookups);

  return NextResponse.json({
    goal: {
      ...enriched,
      milestones: milestonesRes.data || [],
      linked_habits: linkedHabits.map((h) => {
        const link = (habitLinksRes.data || []).find(
          (l: Record<string, unknown>) => l.habit_id === h.id
        );
        return { ...h, weight: link ? (link as Record<string, unknown>).weight : 1.0 };
      }) as Record<string, unknown>[],
      linked_tasks: linkedTasks,
      sub_goals: subgoalsRes.data || [],
      activity: activityRes.data || [],
    },
  });
}

// ---- PATCH: Update a goal ----

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

  // Fetch current goal for diff logging
  const { data: currentGoal } = await platform(supabase)
    .from("goals")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!currentGoal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const body = await request.json();

  // Allowed update fields
  const allowedFields = [
    "title", "description", "category_id", "timeframe_id",
    "start_date", "target_date", "progress_type", "progress_value",
    "target_value", "current_value", "unit", "status", "parent_goal_id",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  // Handle status transitions
  if (updates.status === "completed" && currentGoal.status !== "completed") {
    updates.completed_at = new Date().toISOString();
  }
  if (updates.status === "paused" && currentGoal.status !== "paused") {
    // No special handling, just track the change
  }

  updates.updated_at = new Date().toISOString();

  const { data: updated, error } = await platform(supabase)
    .from("goals")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log field changes
  await logFieldChanges(supabase, "goal", id, user.id, currentGoal, updates).catch(console.error);

  // If current_value changed on a manual goal, recalculate progress
  if (body.current_value !== undefined && currentGoal.progress_type === "manual" && currentGoal.target_value) {
    await recalculateAndUpdateGoalProgress(supabase, id).catch(console.error);
  }

  const lookups = await getGoalHabitLookups(supabase);
  const enriched = enrichGoal(updated, lookups);

  return NextResponse.json({ goal: enriched });
}

// ---- DELETE: Archive or delete a goal ----

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

  // Soft delete: set status to abandoned
  const { error } = await platform(supabase)
    .from("goals")
    .update({
      status: "abandoned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "goal",
    entity_id: id,
    action: "abandoned",
    performed_by: user.id,
  }).catch(console.error);

  return NextResponse.json({ success: true });
}
