import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getGoalHabitLookups, enrichHabits, enrichHabit } from "@/lib/goal-habit-enrichment";
import { logActivity } from "@/lib/activity-log";
import {
  validateRequiredString, validateOptionalString, validateRequiredUUID,
  validateOptionalUUID, validateOptionalDate, validateSpecificDays,
  validateUUIDArray, validatePositiveInt, safeParseBody,
} from "@/lib/validation";

// ---- GET: List habits with filtering ----

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // active, paused, retired
  const category = searchParams.get("category"); // category slug
  const includeStreaks = searchParams.get("include_streaks") !== "false";

  let query = platform(supabase)
    .from("habits")
    .select("*", { count: "exact" })
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  // Status filter
  if (status) {
    const statuses = status.split(",");
    query = query.in("status", statuses);
  } else {
    query = query.eq("status", "active");
  }

  const { data: habits, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with config data
  const lookups = await getGoalHabitLookups(supabase);
  let enrichedHabits = enrichHabits(habits || [], lookups);

  // Filter by category slug if provided
  if (category) {
    enrichedHabits = enrichedHabits.filter(
      (h) => h.category && (h.category as Record<string, unknown>).slug === category
    );
  }

  // Include today's check-in status and recent stats
  if (includeStreaks && enrichedHabits.length > 0) {
    const habitIds = enrichedHabits.map((h) => h.id as string);
    const today = new Date().toISOString().split("T")[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weekAgo = sevenDaysAgo.toISOString().split("T")[0];

    // Fetch today's check-ins and last 7 days
    const [todayRes, weekRes] = await Promise.all([
      platform(supabase)
        .from("habit_check_ins")
        .select("habit_id")
        .in("habit_id", habitIds)
        .eq("check_date", today)
        .eq("checked_by", user.id),
      platform(supabase)
        .from("habit_check_ins")
        .select("habit_id, check_date")
        .in("habit_id", habitIds)
        .gte("check_date", weekAgo)
        .eq("checked_by", user.id),
    ]);

    const checkedToday = new Set(
      (todayRes.data || []).map((c: Record<string, unknown>) => c.habit_id)
    );

    // Count check-ins per habit in last 7 days
    const weekCounts = new Map<string, number>();
    for (const ci of weekRes.data || []) {
      const current = weekCounts.get(ci.habit_id as string) || 0;
      weekCounts.set(ci.habit_id as string, current + 1);
    }

    enrichedHabits = enrichedHabits.map((h) => ({
      ...h,
      checked_today: checkedToday.has(h.id),
      completions_this_week: weekCounts.get(h.id as string) || 0,
    }));
  }

  return NextResponse.json({ habits: enrichedHabits, total: count || 0 });
}

// ---- POST: Create a habit ----

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
  const { title, description, category_id, frequency_id, target_count,
          time_preference_id, specific_days, started_on, goal_ids } = body;

  // Validate inputs
  const titleCheck = validateRequiredString(title, "title", 200);
  if (!titleCheck.valid) return NextResponse.json({ error: titleCheck.error }, { status: 400 });

  const descCheck = validateOptionalString(description, "description", 2000);
  if (!descCheck.valid) return NextResponse.json({ error: descCheck.error }, { status: 400 });

  const freqCheck = validateRequiredUUID(frequency_id, "frequency_id");
  if (!freqCheck.valid) return NextResponse.json({ error: freqCheck.error }, { status: 400 });

  const catCheck = validateOptionalUUID(category_id, "category_id");
  if (!catCheck.valid) return NextResponse.json({ error: catCheck.error }, { status: 400 });

  const tpCheck = validateOptionalUUID(time_preference_id, "time_preference_id");
  if (!tpCheck.valid) return NextResponse.json({ error: tpCheck.error }, { status: 400 });

  const startCheck = validateOptionalDate(started_on, "started_on");
  if (!startCheck.valid) return NextResponse.json({ error: startCheck.error }, { status: 400 });

  const daysCheck = validateSpecificDays(specific_days);
  if (!daysCheck.valid) return NextResponse.json({ error: daysCheck.error }, { status: 400 });

  const goalIdsCheck = validateUUIDArray(goal_ids, "goal_ids");
  if (!goalIdsCheck.valid) return NextResponse.json({ error: goalIdsCheck.error }, { status: 400 });

  // Validate target_count if provided
  let validatedTargetCount = 1;
  if (target_count !== undefined && target_count !== null) {
    const tcCheck = validatePositiveInt(target_count, "target_count", 1, 365);
    if (!tcCheck.valid) return NextResponse.json({ error: tcCheck.error }, { status: 400 });
    validatedTargetCount = tcCheck.value;
  }

  const { data: habit, error } = await platform(supabase)
    .from("habits")
    .insert({
      title: titleCheck.value,
      description: descCheck.value,
      category_id: catCheck.value,
      frequency_id: freqCheck.value,
      target_count: validatedTargetCount,
      time_preference_id: tpCheck.value,
      specific_days: daysCheck.value,
      owner_id: user.id,
      started_on: startCheck.value || new Date().toISOString().split("T")[0],
      source: "manual",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Link to goals if provided
  if (goalIdsCheck.value.length > 0) {
    const goalLinks = goalIdsCheck.value.map((gid: string) => ({
      goal_id: gid,
      habit_id: habit.id,
      weight: 1.0,
    }));
    const { error: linkError } = await platform(supabase).from("goal_habits").insert(goalLinks);
    if (linkError) {
      console.error("Failed to link goals to habit:", linkError.message);
    }
  }

  // Log activity
  await logActivity(supabase, {
    entity_type: "habit",
    entity_id: habit.id,
    action: "created",
    performed_by: user.id,
  }).catch(console.error);

  // Enrich and return
  const lookups = await getGoalHabitLookups(supabase);
  const enriched = enrichHabit(habit, lookups);

  return NextResponse.json({ habit: { ...enriched, checked_today: false, completions_this_week: 0 } }, { status: 201 });
}
