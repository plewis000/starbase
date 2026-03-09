import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";
import { createHabitSchema, parseBody } from "@/lib/schemas";
import {
  buildRRuleFromFrequency,
  taskToHabit,
  getDefaultStatusId,
  getCheckedTodayIds,
  getCompletionCounts,
} from "@/lib/habit-tasks";

// ---- GET: List habits (backed by tasks with is_habit=true) ----

export const GET = withAuth(async (request, { supabase, user }) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // active, paused, retired
  const includeStreaks = searchParams.get("include_streaks") !== "false";

  let query = platform(supabase)
    .from("tasks")
    .select("*", { count: "exact" })
    .eq("is_habit", true)
    .contains("owner_ids", [user.id])
    .order("created_at", { ascending: false });

  // Status filter: active = not completed, retired = completed
  if (status === "retired") {
    query = query.not("completed_at", "is", null);
  } else if (status === "all") {
    // No filter
  } else {
    // Default: active (not completed)
    query = query.is("completed_at", null);
  }

  const { data: tasks, count, error } = await query;

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  let habits = (tasks || []).map(taskToHabit);

  // Include today's check-in status and recent stats
  if (includeStreaks && habits.length > 0) {
    const taskIds = habits.map((h) => h.id as string);
    const [checkedToday, weekCounts] = await Promise.all([
      getCheckedTodayIds(supabase, taskIds, user.id),
      getCompletionCounts(supabase, taskIds, user.id, 7),
    ]);

    habits = habits.map((h) => ({
      ...h,
      checked_today: checkedToday.has(h.id as string),
      completions_this_week: weekCounts.get(h.id as string) || 0,
    }));
  }

  return NextResponse.json({ habits, total: count || 0 });
});

// ---- POST: Create a habit (creates a task with is_habit=true) ----

export const POST = withAuth(async (request, { supabase, user }) => {
  const parsed = await parseBody(request, createHabitSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { title, description, frequency_id, specific_days, started_on, goal_ids } = parsed.data;

  // Build RRULE from frequency
  let recurrenceRule = "FREQ=DAILY";
  if (frequency_id) {
    recurrenceRule = await buildRRuleFromFrequency(supabase, frequency_id, specific_days);
  }

  // Get default task status
  const statusId = await getDefaultStatusId(supabase);

  const startDate = started_on || new Date().toISOString().split("T")[0];

  const { data: task, error } = await platform(supabase)
    .from("tasks")
    .insert({
      title,
      description: description || null,
      is_habit: true,
      recurrence_rule: recurrenceRule,
      recurrence_mode: "flexible",
      owner_ids: [user.id],
      assigned_to: user.id,
      start_date: startDate,
      schedule_date: startDate,
      status_id: statusId,
      streak_current: 0,
      streak_longest: 0,
    })
    .select("*")
    .single();

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Link to goals if provided
  if (goal_ids && goal_ids.length > 0) {
    const goalLinks = goal_ids.map((gid: string) => ({
      goal_id: gid,
      task_id: task.id,
    }));
    const { error: linkErr } = await platform(supabase).from("goal_tasks").insert(goalLinks);
    if (linkErr) console.error(linkErr.message);
  }

  // Log activity
  await logActivity(supabase, {
    entity_type: "habit",
    entity_id: task.id,
    action: "created",
    performed_by: user.id,
  }).catch(console.error);

  const habit = taskToHabit(task);
  return NextResponse.json(
    { habit: { ...habit, checked_today: false, completions_this_week: 0 } },
    { status: 201 }
  );
});
