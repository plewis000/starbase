import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { getGoalHabitLookups, enrichGoals, enrichGoal } from "@/lib/goal-habit-enrichment";
import { logActivity } from "@/lib/activity-log";
import { createGoalSchema, parseBody } from "@/lib/schemas";

// ---- GET: List goals with filtering ----

export const GET = withAuth(async (request, { supabase, user }) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // active, completed, abandoned, paused
  const category = searchParams.get("category"); // category slug
  const timeframe = searchParams.get("timeframe"); // timeframe slug
  const parentId = searchParams.get("parent_id"); // for sub-goals
  const search = searchParams.get("search"); // title/description search
  const includeProgress = searchParams.get("include_progress") !== "false"; // default true

  let query = platform(supabase)
    .from("goals")
    .select("*", { count: "exact" })
    .eq("owner_id", user.id)
    .order("target_date", { ascending: true, nullsFirst: false });

  // Filters
  if (status) {
    const statuses = status.split(",");
    query = query.in("status", statuses);
  } else {
    // Default: show active goals
    query = query.eq("status", "active");
  }

  if (parentId) {
    query = query.eq("parent_goal_id", parentId);
  } else {
    // Top-level goals only by default
    query = query.is("parent_goal_id", null);
  }

  if (search) {
    const { sanitizeSearchInput } = await import("@/lib/validation");
    const sanitized = sanitizeSearchInput(search);
    if (sanitized.length > 0) {
      query = query.or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
    }
  }

  const { data: goals, count, error } = await query;

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Enrich with config data
  const lookups = await getGoalHabitLookups(supabase);

  // Filter by category slug if provided (post-query since it's cross-schema)
  let enrichedGoals = enrichGoals(goals || [], lookups);
  if (category) {
    enrichedGoals = enrichedGoals.filter(
      (g) => g.category && (g.category as Record<string, unknown>).slug === category
    );
  }

  // Fetch linked habits and milestones for each goal if requested
  if (includeProgress && enrichedGoals.length > 0) {
    const goalIds = enrichedGoals.map((g) => g.id as string);

    const [milestonesRes, habitsRes, tasksRes, subgoalsRes] = await Promise.all([
      platform(supabase)
        .from("goal_milestones")
        .select("*")
        .in("goal_id", goalIds)
        .order("sort_order"),
      platform(supabase)
        .from("goal_habits")
        .select("*")
        .in("goal_id", goalIds),
      platform(supabase)
        .from("goal_tasks")
        .select("*")
        .in("goal_id", goalIds),
      platform(supabase)
        .from("goals")
        .select("id, title, status, progress_value, parent_goal_id")
        .in("parent_goal_id", goalIds),
    ]);

    // Group by goal_id
    const milestonesByGoal = groupBy(milestonesRes.data || [], "goal_id");
    const habitLinksByGoal = groupBy(habitsRes.data || [], "goal_id");
    const taskLinksByGoal = groupBy(tasksRes.data || [], "goal_id");
    const subgoalsByGoal = groupBy(subgoalsRes.data || [], "parent_goal_id");

    enrichedGoals = enrichedGoals.map((g) => ({
      ...g,
      milestones: milestonesByGoal.get(g.id as string) || [],
      linked_habits: habitLinksByGoal.get(g.id as string) || [],
      linked_tasks: taskLinksByGoal.get(g.id as string) || [],
      sub_goals: subgoalsByGoal.get(g.id as string) || [],
    }));
  }

  return NextResponse.json({ goals: enrichedGoals, total: count || 0 });
});

// ---- POST: Create a goal ----

export const POST = withAuth(async (request, { supabase, user }) => {
  const parsed = await parseBody(request, createGoalSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { title, description, category_id, timeframe_id, start_date, target_date,
          progress_type, target_value, unit, parent_goal_id,
          milestones, habit_ids, task_ids } = parsed.data;

  // Insert goal
  const { data: goal, error } = await platform(supabase)
    .from("goals")
    .insert({
      title,
      description,
      category_id,
      timeframe_id,
      owner_id: user.id,
      start_date: start_date || new Date().toISOString().split("T")[0],
      target_date,
      progress_type,
      target_value,
      unit,
      parent_goal_id,
      source: "manual",
    })
    .select("*")
    .single();

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Create milestones if provided
  const linkErrors: string[] = [];
  if (milestones && milestones.length > 0) {
    const milestoneRows = milestones.map((m, idx) => ({
      goal_id: goal.id,
      title: m.title,
      target_date: m.target_date,
      sort_order: idx,
    }));
    const { error: msErr } = await platform(supabase).from("goal_milestones").insert(milestoneRows);
    if (msErr) linkErrors.push(`milestones: ${msErr.message}`);
  }

  // Link habits if provided
  if (habit_ids && habit_ids.length > 0) {
    const habitLinks = habit_ids.map((hid: string) => ({
      goal_id: goal.id,
      habit_id: hid,
      weight: 1.0,
    }));
    const { error: hlErr } = await platform(supabase).from("goal_habits").insert(habitLinks);
    if (hlErr) linkErrors.push(`habit_links: ${hlErr.message}`);
  }

  // Link tasks if provided
  if (task_ids && task_ids.length > 0) {
    const taskLinks = task_ids.map((tid: string) => ({
      goal_id: goal.id,
      task_id: tid,
    }));
    const { error: tlErr } = await platform(supabase).from("goal_tasks").insert(taskLinks);
    if (tlErr) linkErrors.push(`task_links: ${tlErr.message}`);
  }

  // Log activity
  await logActivity(supabase, {
    entity_type: "goal",
    entity_id: goal.id,
    action: "created",
    performed_by: user.id,
  }).catch(console.error);

  // "New Year, New Me" achievement — creating a goal in January
  if (new Date().getMonth() === 0) {
    const { checkAchievements } = await import("@/lib/gamification");
    checkAchievements(supabase, user.id, "custom", { custom_type: "january_goal" })
      .catch(console.error);
  }

  // Enrich and return
  const lookups = await getGoalHabitLookups(supabase);
  const enriched = enrichGoal(goal, lookups);

  return NextResponse.json({
    goal: enriched,
    ...(linkErrors.length > 0 ? { warnings: linkErrors } : {}),
  }, { status: 201 });
});

// ---- HELPER ----

function groupBy<T extends Record<string, unknown>>(items: T[], key: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = item[key] as string;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}
