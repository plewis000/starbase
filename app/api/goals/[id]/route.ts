import { NextResponse, after } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { getGoalHabitLookups, enrichGoal } from "@/lib/goal-habit-enrichment";
import { logActivity, logFieldChanges } from "@/lib/activity-log";
import { recalculateAndUpdateGoalProgress } from "@/lib/goal-progress";
import { awardXp, checkAchievements } from "@/lib/gamification";
import { updateGoalSchema, parseBody } from "@/lib/schemas";

// ---- GET: Single goal with full details ----

export const GET = withAuth(async (request, { supabase, user }, params) => {
  const id = params!.id;

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

  // Fetch linked habit details with recent check-in history for 7-day grid
  const habitIds = (habitLinksRes.data || []).map((l: Record<string, unknown>) => l.habit_id as string);
  let linkedHabits: Record<string, unknown>[] = [];
  if (habitIds.length > 0) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data } = await platform(supabase)
      .from("habits")
      .select("id, title, current_streak, longest_streak, total_completions, status")
      .in("id", habitIds);
    // Fetch check-in history for the last 7 days
    const { data: checkIns } = await platform(supabase)
      .from("habit_check_ins")
      .select("habit_id, check_date")
      .in("habit_id", habitIds)
      .gte("check_date", sevenDaysAgo.toISOString().split("T")[0]);
    // Group check-ins by habit
    const checkInMap = new Map<string, { check_date: string }[]>();
    for (const ci of checkIns || []) {
      const arr = checkInMap.get(ci.habit_id) || [];
      arr.push({ check_date: ci.check_date });
      checkInMap.set(ci.habit_id, arr);
    }
    linkedHabits = (data || []).map(h => ({
      ...h,
      check_in_history: checkInMap.get(h.id as string) || [],
    }));
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
      }),
      linked_tasks: linkedTasks,
      sub_goals: subgoalsRes.data || [],
      activity: activityRes.data || [],
    },
  });
});

// ---- PATCH: Update a goal ----

export const PATCH = withAuth(async (request, { supabase, user }, params) => {
  const id = params!.id;

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

  const parsed = await parseBody(request, updateGoalSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { habit_ids: habitIds, ...rest } = parsed.data as Record<string, unknown> & { habit_ids?: string[] };
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key in parsed.body) {
      updates[key] = value;
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
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Log field changes
  await logFieldChanges(supabase, "goal", id, user.id, currentGoal, updates).catch(console.error);

  // If current_value changed on a manual goal, recalculate progress
  if (updates.current_value !== undefined && currentGoal.progress_type === "manual" && currentGoal.target_value) {
    await recalculateAndUpdateGoalProgress(supabase, id).catch(console.error);
  }

  // Award XP when goal is completed (runs after response — P024)
  if (updates.status === "completed" && currentGoal.status !== "completed") {
    after(async () => {
      try {
        await awardXp(supabase, user.id, 100, "goal_completed", `Goal completed: ${updated.title}`, "goal", id);
        await checkAchievements(supabase, user.id, "goal_completed", { goalId: id });
      } catch (err) {
        console.error("[goals] Gamification error on completion:", err);
      }
    });
  }

  // Sync habit links if provided
  if (habitIds !== undefined) {
    await platform(supabase).from("goal_habits").delete().eq("goal_id", id);
    if (habitIds.length > 0) {
      await platform(supabase).from("goal_habits").insert(
        habitIds.map((hid: string) => ({ goal_id: id, habit_id: hid }))
      );
    }
  }

  const lookups = await getGoalHabitLookups(supabase);
  const enriched = enrichGoal(updated, lookups);

  return NextResponse.json({ goal: enriched });
});

// ---- DELETE: Archive or delete a goal ----

export const DELETE = withAuth(async (request, { supabase, user }, params) => {
  const id = params!.id;

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
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "goal",
    entity_id: id,
    action: "abandoned",
    performed_by: user.id,
  }).catch(console.error);

  return NextResponse.json({ success: true });
});
