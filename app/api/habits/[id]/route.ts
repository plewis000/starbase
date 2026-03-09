import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { logActivity, logFieldChanges } from "@/lib/activity-log";
import { taskToHabit, inferTargetType } from "@/lib/habit-tasks";
import { updateHabitSchema, parseBody } from "@/lib/schemas";
import { z } from "zod";

// ---- GET: Single habit with full details (backed by tasks) ----

export const GET = withAuth(async (request, { supabase, user }, params) => {
  const id = params!.id;

  const { data: task, error } = await platform(supabase)
    .from("tasks")
    .select("*")
    .eq("id", id)
    .eq("is_habit", true)
    .contains("owner_ids", [user.id])
    .single();

  if (error || !task) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }

  // Fetch completion history (last 90 days for heatmap)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const startDate = `${ninetyDaysAgo.getFullYear()}-${String(ninetyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(ninetyDaysAgo.getDate()).padStart(2, "0")}`;

  const [completionsRes, goalLinksRes, activityRes] = await Promise.all([
    platform(supabase)
      .from("task_completions")
      .select("completed_date, note, mood, value, completed_at")
      .eq("task_id", id)
      .gte("completed_date", startDate)
      .order("completed_date", { ascending: true }),
    platform(supabase)
      .from("goal_tasks")
      .select("goal_id")
      .eq("task_id", id),
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

  // Convert completions to check_in_history shape (compatible with existing UI)
  const checkInHistory = (completionsRes.data || []).map((c: Record<string, unknown>) => ({
    check_date: c.completed_date,
    note: c.note,
    mood: c.mood,
    value: c.value,
    checked_at: c.completed_at,
  }));

  const habit = taskToHabit(task);
  const targetType = inferTargetType(task.recurrence_rule);

  return NextResponse.json({
    habit: {
      ...habit,
      check_in_history: checkInHistory,
      linked_goals: linkedGoals,
      activity: activityRes.data || [],
      streak_context: {
        target_type: targetType,
        target_count: 1,
      },
    },
  });
});

// ---- PATCH: Update a habit (updates the task) ----

export const PATCH = withAuth(async (request, { supabase, user }, params) => {
  const id = params!.id;

  // Fetch current task
  const { data: currentTask } = await platform(supabase)
    .from("tasks")
    .select("*")
    .eq("id", id)
    .eq("is_habit", true)
    .contains("owner_ids", [user.id])
    .single();

  if (!currentTask) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }

  const patchSchema = updateHabitSchema.extend({
    goal_ids: z.array(z.string().uuid()).max(50).optional(),
  });
  const parsed = await parseBody(request, patchSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { goal_ids: parsedGoalIds, ...validatedFields } = parsed.data;
  const updates: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(validatedFields)) {
    if (key in parsed.body) {
      // Map habit fields to task fields
      if (key === "status") {
        if (val === "retired") {
          updates.completed_at = new Date().toISOString();
        } else if (val === "active" && currentTask.completed_at) {
          updates.completed_at = null;
        }
        // "paused" → no task-level equivalent, just note it
        continue;
      }
      updates[key] = val;
    }
  }

  updates.updated_at = new Date().toISOString();

  const { data: updated, error } = await platform(supabase)
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Handle goal linking if goal_ids provided
  if (parsedGoalIds !== undefined) {
    await platform(supabase).from("goal_tasks").delete().eq("task_id", id);
    if (parsedGoalIds.length > 0) {
      const links = parsedGoalIds.map((goalId: string) => ({
        goal_id: goalId,
        task_id: id,
      }));
      await platform(supabase).from("goal_tasks").insert(links);
    }
  }

  await logFieldChanges(supabase, "habit", id, user.id, currentTask, updates).catch(console.error);

  const habit = taskToHabit(updated);
  return NextResponse.json({ habit });
});

// ---- DELETE: Retire a habit (soft delete — mark task completed) ----

export const DELETE = withAuth(async (request, { supabase, user }, params) => {
  const id = params!.id;

  const { error } = await platform(supabase)
    .from("tasks")
    .update({
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("is_habit", true)
    .contains("owner_ids", [user.id]);

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "habit",
    entity_id: id,
    action: "retired",
    performed_by: user.id,
  }).catch(console.error);

  return NextResponse.json({ success: true });
});
