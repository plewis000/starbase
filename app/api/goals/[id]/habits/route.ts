import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";
import { recalculateAndUpdateGoalProgress } from "@/lib/goal-progress";

// ---- GET: List habits linked to a goal ----

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: goalId } = await params;

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

  // Get links with habit details
  const { data: links, error } = await platform(supabase)
    .from("goal_habits")
    .select("*")
    .eq("goal_id", goalId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!links || links.length === 0) {
    return NextResponse.json({ habits: [] });
  }

  // Fetch habit details
  const habitIds = links.map((l) => l.habit_id);
  const { data: habits } = await platform(supabase)
    .from("habits")
    .select("id, title, status, current_streak, longest_streak, total_completions, last_completed_at, frequency_id, category_id")
    .in("id", habitIds);

  // Merge link data (weight) with habit details
  const enrichedHabits = (habits || []).map((h) => {
    const link = links.find((l) => l.habit_id === h.id);
    return {
      ...h,
      weight: link?.weight ?? 1.0,
      link_id: link?.id,
      linked_at: link?.created_at,
    };
  }) as Record<string, unknown>[];

  return NextResponse.json({ habits: enrichedHabits });
}

// ---- POST: Link a habit to a goal ----

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: goalId } = await params;
  const body = await request.json();
  const { habit_id, weight } = body;

  // Validate required fields
  if (!habit_id || typeof habit_id !== "string") {
    return NextResponse.json({ error: "habit_id is required" }, { status: 400 });
  }

  // Validate weight if provided
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

  // Verify habit belongs to user
  const { data: habit } = await platform(supabase)
    .from("habits")
    .select("id, title")
    .eq("id", habit_id)
    .eq("owner_id", user.id)
    .single();

  if (!habit) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }

  // Insert link
  const { data: link, error } = await platform(supabase)
    .from("goal_habits")
    .insert({
      goal_id: goalId,
      habit_id: habit_id,
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log activity
  await logActivity(supabase, {
    entity_type: "goal_habit",
    entity_id: link.id,
    action: "linked",
    performed_by: user.id,
    metadata: { goal_id: goalId, habit_id: habit_id, habit_title: habit.title },
  }).catch(console.error);

  // Recalculate progress if habit-driven
  if (goal.progress_type === "habit_driven") {
    await recalculateAndUpdateGoalProgress(supabase, goalId).catch(console.error);
  }

  return NextResponse.json({ link }, { status: 201 });
}

// ---- DELETE: Unlink a habit from a goal ----

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: goalId } = await params;
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
    .from("goal_habits")
    .delete()
    .eq("goal_id", goalId)
    .eq("habit_id", habitId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "goal_habit",
    entity_id: goalId,
    action: "unlinked",
    performed_by: user.id,
    metadata: { goal_id: goalId, habit_id: habitId },
  }).catch(console.error);

  // Recalculate progress if habit-driven
  if (goal.progress_type === "habit_driven") {
    await recalculateAndUpdateGoalProgress(supabase, goalId).catch(console.error);
  }

  return NextResponse.json({ success: true });
}
