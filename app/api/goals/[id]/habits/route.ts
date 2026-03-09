import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";
import { recalculateAndUpdateGoalProgress } from "@/lib/goal-progress";
import { inferFrequencyName } from "@/lib/habit-tasks";

// ---- GET: List habits linked to a goal (backed by tasks via goal_tasks) ----

export const GET = withAuth(async (request, { supabase, user }, params) => {
  const goalId = params!.id;

  // Verify goal exists and belongs to user
  const { data: goal } = await platform(supabase)
    .from("goals")
    .select("id")
    .eq("id", goalId)
    .eq("owner_id", user.id)
    .single();

  if (!goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  // Get links
  const { data: links, error } = await platform(supabase)
    .from("goal_tasks")
    .select("*")
    .eq("goal_id", goalId);

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!links || links.length === 0) {
    return NextResponse.json({ habits: [] });
  }

  // Fetch habit-task details
  const taskIds = links.map((l) => l.task_id);
  const { data: tasks } = await platform(supabase)
    .from("tasks")
    .select("*")
    .eq("is_habit", true)
    .in("id", taskIds);

  // Merge link data (weight) with task details
  const enrichedHabits = (tasks || []).map((t) => {
    const link = links.find((l) => l.task_id === t.id);
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      streak_current: t.streak_current || 0,
      streak_longest: t.streak_longest || 0,
      recurrence_rule: t.recurrence_rule,
      frequency_name: inferFrequencyName(t.recurrence_rule),
      completed_at: t.completed_at,
      weight: link?.weight ?? 1.0,
      link_id: link?.id,
      linked_at: link?.created_at,
    };
  });

  return NextResponse.json({ habits: enrichedHabits });
});

// ---- POST: Link a habit-task to a goal ----

export const POST = withAuth(async (request, { supabase, user }, params) => {
  const goalId = params!.id;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { habit_id, weight } = body;

  if (!habit_id || typeof habit_id !== "string") {
    return NextResponse.json({ error: "habit_id is required" }, { status: 400 });
  }

  if (weight !== undefined) {
    if (typeof weight !== "number" || weight <= 0 || weight > 10) {
      return NextResponse.json(
        { error: "weight must be a number between 0 (exclusive) and 10" },
        { status: 400 }
      );
    }
  }

  // Verify goal belongs to user
  const { data: goal } = await platform(supabase)
    .from("goals")
    .select("id, progress_type")
    .eq("id", goalId)
    .eq("owner_id", user.id)
    .single();

  if (!goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  // Verify habit-task belongs to user
  const { data: task } = await platform(supabase)
    .from("tasks")
    .select("id, title")
    .eq("id", habit_id)
    .eq("is_habit", true)
    .contains("owner_ids", [user.id])
    .single();

  if (!task) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }

  // Insert link via goal_tasks
  const { data: link, error } = await platform(supabase)
    .from("goal_tasks")
    .insert({
      goal_id: goalId,
      task_id: habit_id,
      weight: weight || 1.0,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This habit is already linked to this goal" },
        { status: 409 }
      );
    }
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "goal_habit",
    entity_id: link.id,
    action: "linked",
    performed_by: user.id,
    metadata: { goal_id: goalId, habit_id: habit_id, habit_title: task.title },
  }).catch(console.error);

  if (goal.progress_type === "habit_driven") {
    await recalculateAndUpdateGoalProgress(supabase, goalId).catch(console.error);
  }

  return NextResponse.json({ link }, { status: 201 });
});

// ---- DELETE: Unlink a habit from a goal ----

export const DELETE = withAuth(async (request, { supabase, user }, params) => {
  const goalId = params!.id;
  const { searchParams } = new URL(request.url);
  const habitId = searchParams.get("habit_id");

  if (!habitId) {
    return NextResponse.json(
      { error: "habit_id query param required" },
      { status: 400 }
    );
  }

  // Verify goal belongs to user
  const { data: goal } = await platform(supabase)
    .from("goals")
    .select("id, progress_type")
    .eq("id", goalId)
    .eq("owner_id", user.id)
    .single();

  if (!goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const { error } = await platform(supabase)
    .from("goal_tasks")
    .delete()
    .eq("goal_id", goalId)
    .eq("task_id", habitId);

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "goal_habit",
    entity_id: goalId,
    action: "unlinked",
    performed_by: user.id,
    metadata: { goal_id: goalId, habit_id: habitId },
  }).catch(console.error);

  if (goal.progress_type === "habit_driven") {
    await recalculateAndUpdateGoalProgress(supabase, goalId).catch(console.error);
  }

  return NextResponse.json({ success: true });
});
