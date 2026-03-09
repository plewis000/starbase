import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { recalculateTaskStreak } from "@/lib/streak-engine";
import { inferTargetType } from "@/lib/habit-tasks";
import { logActivity } from "@/lib/activity-log";

// POST /api/routines/check
// Body: { task_id, date, action: "check" | "uncheck" }
export const POST = withAuth(async (request: NextRequest, { supabase, user }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { task_id, date, action = "check" } = body;

  if (!task_id || !date) {
    return NextResponse.json({ error: "task_id and date are required" }, { status: 400 });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  // Don't allow future dates
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (date > todayStr) {
    return NextResponse.json({ error: "Cannot complete future dates" }, { status: 400 });
  }

  // Verify task exists and is a routine
  const { data: task, error: taskError } = await platform(supabase)
    .from("tasks")
    .select("id, title, recurrence_rule, is_habit, recurrence_source_id")
    .eq("id", task_id)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (!task.is_habit && !task.recurrence_rule) {
    return NextResponse.json({ error: "Task is not a routine" }, { status: 400 });
  }

  if (action === "check") {
    // Check if already completed for this date
    const { data: existing } = await platform(supabase)
      .from("task_completions")
      .select("id")
      .eq("task_id", task_id)
      .eq("completed_date", date)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Already completed for this date" }, { status: 409 });
    }

    // Create completion record
    const { error: insertError } = await platform(supabase)
      .from("task_completions")
      .insert({
        task_id,
        completed_date: date,
        completed_by: user.id,
      });

    if (insertError) {
      console.error("Failed to create completion:", insertError.message);
      return NextResponse.json({ error: "Failed to create completion" }, { status: 500 });
    }

    // Recalculate streak
    const targetType = inferTargetType(task.recurrence_rule);
    const streakResult = await recalculateTaskStreak(supabase, task_id, 1, targetType);

    // Log activity
    await logActivity(supabase, {
      entity_type: "task",
      entity_id: task_id,
      action: "completed",
      performed_by: user.id,
    });

    // Award XP for habit completion
    try {
      const baseXP = 10;
      const streakBonus = Math.min(streakResult.current_streak * 2, 20);
      const totalXP = baseXP + streakBonus;

      // Get user's gamification profile
      const { data: profile } = await platform(supabase)
        .from("gamification_profiles")
        .select("id, total_xp")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile) {
        await platform(supabase)
          .from("xp_ledger")
          .insert({
            user_id: user.id,
            amount: totalXP,
            action_type: "habit_check_in",
            description: `Completed "${task.title}" (streak: ${streakResult.current_streak})`,
            source_entity_type: "task",
            source_entity_id: task_id,
          });

        await platform(supabase)
          .from("gamification_profiles")
          .update({ total_xp: (profile.total_xp || 0) + totalXP })
          .eq("id", profile.id);
      }
    } catch {
      // XP award is non-critical
    }

    return NextResponse.json({
      success: true,
      action: "checked",
      date,
      streak: streakResult,
    });
  }

  if (action === "uncheck") {
    const { error: deleteError } = await platform(supabase)
      .from("task_completions")
      .delete()
      .eq("task_id", task_id)
      .eq("completed_date", date);

    if (deleteError) {
      console.error("Failed to delete completion:", deleteError.message);
      return NextResponse.json({ error: "Failed to remove completion" }, { status: 500 });
    }

    // Recalculate streak
    const targetType2 = inferTargetType(task.recurrence_rule);
    const streakResult = await recalculateTaskStreak(supabase, task_id, 1, targetType2);

    return NextResponse.json({
      success: true,
      action: "unchecked",
      date,
      streak: streakResult,
    });
  }

  return NextResponse.json({ error: "action must be 'check' or 'uncheck'" }, { status: 400 });
});
