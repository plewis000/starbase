import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getGoalHabitLookups, enrichGoals, enrichGoal } from "@/lib/goal-habit-enrichment";
import { logActivity } from "@/lib/activity-log";
import {
  validateRequiredString, validateOptionalString, validateOptionalUUID,
  validateOptionalDate, validateOptionalNumber, validateUUIDArray,
  validateEnum, safeParseBody,
} from "@/lib/validation";

// ---- GET: List goals with filtering ----

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // active, completed, abandoned, paused
  const category = searchParams.get("category"); // category slug
  const timeframe = searchParams.get("timeframe"); // timeframe slug
  const parentId = searchParams.get("parent_id"); // for sub-goals
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

  const { data: goals, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
}

// ---- POST: Create a goal ----

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await safeParseBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.body;
  const { title, description, category_id, timeframe_id, start_date, target_date,
          progress_type, target_value, unit, parent_goal_id,
          milestones, habit_ids, task_ids } = body;

  // Validate inputs
  const titleCheck = validateRequiredString(title, "title", 300);
  if (!titleCheck.valid) return NextResponse.json({ error: titleCheck.error }, { status: 400 });

  const descCheck = validateOptionalString(description, "description", 5000);
  if (!descCheck.valid) return NextResponse.json({ error: descCheck.error }, { status: 400 });

  const catCheck = validateOptionalUUID(category_id, "category_id");
  if (!catCheck.valid) return NextResponse.json({ error: catCheck.error }, { status: 400 });

  const tfCheck = validateOptionalUUID(timeframe_id, "timeframe_id");
  if (!tfCheck.valid) return NextResponse.json({ error: tfCheck.error }, { status: 400 });

  const parentCheck = validateOptionalUUID(parent_goal_id, "parent_goal_id");
  if (!parentCheck.valid) return NextResponse.json({ error: parentCheck.error }, { status: 400 });

  const startCheck = validateOptionalDate(start_date, "start_date");
  if (!startCheck.valid) return NextResponse.json({ error: startCheck.error }, { status: 400 });

  const targetDateCheck = validateOptionalDate(target_date, "target_date");
  if (!targetDateCheck.valid) return NextResponse.json({ error: targetDateCheck.error }, { status: 400 });

  const targetValCheck = validateOptionalNumber(target_value, "target_value", 0, 1000000);
  if (!targetValCheck.valid) return NextResponse.json({ error: targetValCheck.error }, { status: 400 });

  // Validate progress_type if provided
  const validProgressTypes = ["manual", "milestone", "habit_driven", "task_driven"] as const;
  if (progress_type) {
    const ptCheck = validateEnum(progress_type, "progress_type", validProgressTypes);
    if (!ptCheck.valid) return NextResponse.json({ error: ptCheck.error }, { status: 400 });
  }

  const habitIdsCheck = validateUUIDArray(habit_ids, "habit_ids");
  if (!habitIdsCheck.valid) return NextResponse.json({ error: habitIdsCheck.error }, { status: 400 });

  const taskIdsCheck = validateUUIDArray(task_ids, "task_ids");
  if (!taskIdsCheck.valid) return NextResponse.json({ error: taskIdsCheck.error }, { status: 400 });

  // Insert goal
  const { data: goal, error } = await platform(supabase)
    .from("goals")
    .insert({
      title: titleCheck.value,
      description: descCheck.value,
      category_id: catCheck.value,
      timeframe_id: tfCheck.value,
      owner_id: user.id,
      start_date: startCheck.value || new Date().toISOString().split("T")[0],
      target_date: targetDateCheck.value,
      progress_type: (progress_type as string) || "manual",
      target_value: targetValCheck.value,
      unit: typeof unit === "string" ? unit.slice(0, 50) : null,
      parent_goal_id: parentCheck.value,
      source: "manual",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create milestones if provided
  const linkErrors: string[] = [];
  if (milestones && Array.isArray(milestones) && milestones.length > 0) {
    const milestoneRows = milestones
      .filter((m: unknown) => m && typeof m === "object" && "title" in (m as Record<string, unknown>))
      .slice(0, 50) // Max 50 milestones
      .map((m: { title: string; target_date?: string }, idx: number) => ({
        goal_id: goal.id,
        title: String(m.title).trim().slice(0, 300),
        target_date: m.target_date || null,
        sort_order: idx,
      }));
    if (milestoneRows.length > 0) {
      const { error: msErr } = await platform(supabase).from("goal_milestones").insert(milestoneRows);
      if (msErr) linkErrors.push(`milestones: ${msErr.message}`);
    }
  }

  // Link habits if provided
  if (habitIdsCheck.value.length > 0) {
    const habitLinks = habitIdsCheck.value.map((hid: string) => ({
      goal_id: goal.id,
      habit_id: hid,
      weight: 1.0,
    }));
    const { error: hlErr } = await platform(supabase).from("goal_habits").insert(habitLinks);
    if (hlErr) linkErrors.push(`habit_links: ${hlErr.message}`);
  }

  // Link tasks if provided
  if (taskIdsCheck.value.length > 0) {
    const taskLinks = taskIdsCheck.value.map((tid: string) => ({
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

  // Enrich and return
  const lookups = await getGoalHabitLookups(supabase);
  const enriched = enrichGoal(goal, lookups);

  return NextResponse.json({
    goal: enriched,
    ...(linkErrors.length > 0 ? { warnings: linkErrors } : {}),
  }, { status: 201 });
}

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
