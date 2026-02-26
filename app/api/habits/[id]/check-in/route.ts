import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform, config } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";
import { recalculateAndUpdateStreak } from "@/lib/streak-engine";
import { recalculateAndUpdateGoalProgress } from "@/lib/goal-progress";
import { safeParseBody, validateOptionalString, validateOptionalNumber, validateEnum, isValidDate } from "@/lib/validation";

// ---- POST: Check in to a habit ----

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: habitId } = await params;
  const parsed = await safeParseBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.body;
  const { check_date, value, unit, note, mood } = body;

  // Default to today
  const date = (check_date as string) || new Date().toISOString().split("T")[0];

  // Validate date format and it must be a real date
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD with a real date." }, { status: 400 });
  }

  // Don't allow check-ins in the future
  const today = new Date().toISOString().split("T")[0];
  if (date > today) {
    return NextResponse.json({ error: "Cannot check in for future dates" }, { status: 400 });
  }

  // Don't allow check-ins more than 1 year in the past
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  if (date < oneYearAgo.toISOString().split("T")[0]) {
    return NextResponse.json({ error: "Cannot check in for dates more than 1 year ago" }, { status: 400 });
  }

  // Validate optional fields
  const valueCheck = validateOptionalNumber(value, "value", 0, 1000000);
  if (!valueCheck.valid) return NextResponse.json({ error: valueCheck.error }, { status: 400 });

  const noteCheck = validateOptionalString(note, "note", 1000);
  if (!noteCheck.valid) return NextResponse.json({ error: noteCheck.error }, { status: 400 });

  const unitCheck = validateOptionalString(unit, "unit", 50);
  if (!unitCheck.valid) return NextResponse.json({ error: unitCheck.error }, { status: 400 });

  // Validate mood if provided
  const validMoods = ["great", "good", "neutral", "tough", "terrible"] as const;
  if (mood) {
    const moodCheck = validateEnum(mood, "mood", validMoods);
    if (!moodCheck.valid) return NextResponse.json({ error: moodCheck.error }, { status: 400 });
  }

  // Verify habit exists and belongs to user
  const { data: habit } = await platform(supabase)
    .from("habits")
    .select("id, frequency_id, target_count, started_on, status")
    .eq("id", habitId)
    .eq("owner_id", user.id)
    .single();

  if (!habit) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }

  if (habit.status !== "active") {
    return NextResponse.json({ error: "Cannot check in to a paused or retired habit" }, { status: 400 });
  }

  // Insert check-in (unique constraint prevents duplicates)
  const { data: checkIn, error } = await platform(supabase)
    .from("habit_check_ins")
    .insert({
      habit_id: habitId,
      checked_by: user.id,
      check_date: date,
      value: valueCheck.value,
      unit: unitCheck.value,
      note: noteCheck.value,
      mood: (mood as string) || null,
      source: "manual",
    })
    .select("*")
    .single();

  if (error) {
    // Handle duplicate check-in
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Already checked in for this date" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get frequency details for streak calculation
  const { data: freq } = await config(supabase)
    .from("habit_frequencies")
    .select("target_type, default_target")
    .eq("id", habit.frequency_id)
    .single();

  const targetType = freq ? (freq.target_type as "daily" | "weekly" | "monthly") : "daily";

  // Recalculate streak
  const streakResult = await recalculateAndUpdateStreak(
    supabase,
    habitId,
    habit.target_count,
    targetType,
    habit.started_on
  );

  // Log activity
  await logActivity(supabase, {
    entity_type: "habit_check_in",
    entity_id: checkIn.id,
    action: "created",
    performed_by: user.id,
    metadata: {
      habit_id: habitId,
      check_date: date,
      value,
      mood,
      streak_after: streakResult.current_streak,
    },
  }).catch(console.error);

  // Update progress on any linked goals
  const { data: goalLinks } = await platform(supabase)
    .from("goal_habits")
    .select("goal_id")
    .eq("habit_id", habitId);

  if (goalLinks && goalLinks.length > 0) {
    for (const link of goalLinks) {
      await recalculateAndUpdateGoalProgress(supabase, link.goal_id).catch(console.error);
    }
  }

  return NextResponse.json({
    check_in: checkIn,
    streak: streakResult,
  }, { status: 201 });
}

// ---- DELETE: Undo a check-in ----

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: habitId } = await params;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "date query param required (YYYY-MM-DD)" }, { status: 400 });
  }

  if (!isValidDate(date)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
  }

  // Delete the check-in
  const { error } = await platform(supabase)
    .from("habit_check_ins")
    .delete()
    .eq("habit_id", habitId)
    .eq("checked_by", user.id)
    .eq("check_date", date);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Verify habit for streak recalc
  const { data: habit } = await platform(supabase)
    .from("habits")
    .select("id, frequency_id, target_count, started_on")
    .eq("id", habitId)
    .eq("owner_id", user.id)
    .single();

  if (habit) {
    const { data: freq } = await config(supabase)
      .from("habit_frequencies")
      .select("target_type")
      .eq("id", habit.frequency_id)
      .single();

    const targetType = freq ? (freq.target_type as "daily" | "weekly" | "monthly") : "daily";

    await recalculateAndUpdateStreak(
      supabase, habitId, habit.target_count, targetType, habit.started_on
    );

    // Update linked goal progress
    const { data: goalLinks } = await platform(supabase)
      .from("goal_habits")
      .select("goal_id")
      .eq("habit_id", habitId);

    if (goalLinks && goalLinks.length > 0) {
      for (const link of goalLinks) {
        await recalculateAndUpdateGoalProgress(supabase, link.goal_id).catch(console.error);
      }
    }
  }

  await logActivity(supabase, {
    entity_type: "habit_check_in",
    entity_id: habitId,
    action: "deleted",
    performed_by: user.id,
    metadata: { check_date: date },
  }).catch(console.error);

  return NextResponse.json({ success: true });
}
