import { NextResponse, after } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";
import { recalculateTaskStreak } from "@/lib/streak-engine";
import { recalculateAndUpdateGoalProgress } from "@/lib/goal-progress";
import { habitCheckInSchema, parseBody } from "@/lib/schemas";
import { isValidDate } from "@/lib/validation";
import { awardXp, checkAchievements } from "@/lib/gamification";
import { inferTargetType } from "@/lib/habit-tasks";

// ---- POST: Check in to a habit (writes to task_completions) ----

export const POST = withAuth(async (request, { supabase, user }, params) => {
  const taskId = params!.id;
  const parsed = await parseBody(request, habitCheckInSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { check_date, value, note, mood } = parsed.data;

  // Default to today (local date)
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const date = check_date || todayStr;

  // Don't allow check-ins in the future
  if (date > todayStr) {
    return NextResponse.json({ error: "Cannot check in for future dates" }, { status: 400 });
  }

  // Don't allow check-ins more than 1 year in the past
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, "0")}-${String(oneYearAgo.getDate()).padStart(2, "0")}`;
  if (date < oneYearAgoStr) {
    return NextResponse.json({ error: "Cannot check in for dates more than 1 year ago" }, { status: 400 });
  }

  // Verify task exists, is a habit, and belongs to user
  const { data: task } = await platform(supabase)
    .from("tasks")
    .select("id, recurrence_rule, start_date, completed_at")
    .eq("id", taskId)
    .eq("is_habit", true)
    .contains("owner_ids", [user.id])
    .single();

  if (!task) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }

  if (task.completed_at) {
    return NextResponse.json({ error: "Cannot check in to a retired habit" }, { status: 400 });
  }

  // Insert completion (unique constraint prevents duplicates)
  const { data: completion, error } = await platform(supabase)
    .from("task_completions")
    .insert({
      task_id: taskId,
      completed_by: user.id,
      completed_date: date,
      completed_at: new Date().toISOString(),
      value: value ?? null,
      note: note ?? null,
      mood: mood ?? null,
      source: "manual",
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Already checked in for this date" },
        { status: 409 }
      );
    }
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Recalculate streak
  const targetType = inferTargetType(task.recurrence_rule);
  const startedOn = task.start_date || todayStr;

  const streakResult = await recalculateTaskStreak(
    supabase,
    taskId,
    1, // target_count
    targetType,
    startedOn
  );

  // Log activity
  await logActivity(supabase, {
    entity_type: "habit_check_in",
    entity_id: completion.id,
    action: "created",
    performed_by: user.id,
    metadata: {
      habit_id: taskId,
      check_date: date,
      value,
      mood,
      streak_after: streakResult.current_streak,
    },
  }).catch(console.error);

  // Update progress on any linked goals
  const { data: goalLinks } = await platform(supabase)
    .from("goal_tasks")
    .select("goal_id")
    .eq("task_id", taskId);

  if (goalLinks && goalLinks.length > 0) {
    for (const link of goalLinks) {
      await recalculateAndUpdateGoalProgress(supabase, link.goal_id).catch(console.error);
    }
  }

  // Award XP for habit check-in (runs after response is sent)
  after(async () => {
    try {
      let xpAmount = 15;
      const streak = streakResult.current_streak;
      if (streak >= 90) xpAmount += 50;
      else if (streak >= 30) xpAmount += 25;
      else if (streak >= 7) xpAmount += 10;

      await awardXp(
        supabase,
        user.id,
        xpAmount,
        "habit_check_in",
        `Habit check-in${streak > 1 ? ` (${streak}-day streak)` : ""}`,
        "habit",
        taskId
      );

      await checkAchievements(supabase, user.id, "habit_streak", {
        current_streak: streak,
        habitId: taskId,
      });
      await checkAchievements(supabase, user.id, "habit_count", {
        habitId: taskId,
      });

      if (streak >= 7 && streakResult.longest_streak > streak) {
        await checkAchievements(supabase, user.id, "custom", {
          custom_type: "streak_rebuilt",
        });
      }

      // Household completion celebration
      try {
        const { getHouseholdContext, getHouseholdMemberIds } = await import("@/lib/household");
        const { triggerNotification } = await import("@/lib/notify");
        const hCtx = await getHouseholdContext(supabase, user.id);
        if (hCtx) {
          const memberIds = await getHouseholdMemberIds(supabase, hCtx.household_id);
          if (memberIds.length > 1) {
            let allComplete = true;
            for (const memberId of memberIds) {
              const { data: mHabits } = await platform(supabase)
                .from("tasks")
                .select("id")
                .eq("is_habit", true)
                .contains("owner_ids", [memberId])
                .is("completed_at", null);

              const { data: mCompletions } = await platform(supabase)
                .from("task_completions")
                .select("task_id")
                .eq("completed_by", memberId)
                .eq("completed_date", todayStr);

              const mTotal = mHabits?.length || 0;
              const mChecked = new Set((mCompletions || []).map(c => c.task_id)).size;
              if (mTotal === 0 || mChecked < mTotal) {
                allComplete = false;
                break;
              }
            }

            if (allComplete) {
              for (const memberId of memberIds) {
                triggerNotification(supabase, {
                  recipientUserId: memberId,
                  title: "Household sweep! Everyone finished all habits today.",
                  body: "Both of you crushed every habit today. That's the kind of day that compounds.",
                  event: "achievement_unlocked",
                }).catch(() => {});
              }
            }
          }
        }
      } catch {
        // Non-critical
      }
    } catch (err) {
      console.error("Gamification error:", err);
    }
  });

  return NextResponse.json({
    check_in: completion,
    streak: streakResult,
  }, { status: 201 });
});

// ---- DELETE: Undo a check-in ----

export const DELETE = withAuth(async (request, { supabase, user }, params) => {
  const taskId = params!.id;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "date query param required (YYYY-MM-DD)" }, { status: 400 });
  }

  if (!isValidDate(date)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
  }

  // Delete the completion
  const { error } = await platform(supabase)
    .from("task_completions")
    .delete()
    .eq("task_id", taskId)
    .eq("completed_by", user.id)
    .eq("completed_date", date);

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Verify task for streak recalc
  const { data: task } = await platform(supabase)
    .from("tasks")
    .select("id, recurrence_rule, start_date")
    .eq("id", taskId)
    .eq("is_habit", true)
    .contains("owner_ids", [user.id])
    .single();

  if (task) {
    const targetType = inferTargetType(task.recurrence_rule);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    await recalculateTaskStreak(
      supabase, taskId, 1, targetType, task.start_date || todayStr
    );

    // Update linked goal progress
    const { data: goalLinks } = await platform(supabase)
      .from("goal_tasks")
      .select("goal_id")
      .eq("task_id", taskId);

    if (goalLinks && goalLinks.length > 0) {
      for (const link of goalLinks) {
        await recalculateAndUpdateGoalProgress(supabase, link.goal_id).catch(console.error);
      }
    }
  }

  await logActivity(supabase, {
    entity_type: "habit_check_in",
    entity_id: taskId,
    action: "deleted",
    performed_by: user.id,
    metadata: { check_date: date },
  }).catch(console.error);

  return NextResponse.json({ success: true });
});
