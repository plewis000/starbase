import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";
import { parseBody } from "@/lib/schemas";
import { recalculateTaskStreak } from "@/lib/streak-engine";
import { awardXp, checkAchievements } from "@/lib/gamification";
import { formatDateOnly, getNextOccurrence, parseDateLocal } from "@/lib/recurrence";

const completionSchema = z.object({
  completed_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
  note: z.string().max(1000).nullish().transform((v) => v ?? null),
  mood: z
    .enum(["great", "good", "neutral", "tough", "terrible"])
    .optional(),
  value: z.number().min(0).max(1000000).optional(),
});

// =============================================================
// GET /api/tasks/:id/completions — List completions for a task
// =============================================================
export const GET = withAuth(async (_request, { supabase, ctx }, params) => {
  const taskId = params?.id;
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const hasAccess = await verifyTaskHouseholdAccess(
    supabase,
    taskId!,
    memberIds
  );
  if (!hasAccess) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Get the task to check for recurrence chain
  const { data: task } = await platform(supabase)
    .from("tasks")
    .select("id, recurrence_source_id")
    .eq("id", taskId!)
    .single();

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Fetch completions for this task (or entire recurrence chain)
  const sourceId = task.recurrence_source_id || task.id;
  const { data: completions, error } = await platform(supabase)
    .from("task_completions")
    .select("*")
    .or(`task_id.eq.${taskId},recurrence_source_id.eq.${sourceId}`)
    .order("completed_date", { ascending: false });

  if (error) {
    console.error(error.message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ completions: completions || [] });
});

// =============================================================
// POST /api/tasks/:id/completions — Record a completion
// =============================================================
export const POST = withAuth(async (request, { supabase, user, ctx }, params) => {
  const taskId = params?.id;
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const hasAccess = await verifyTaskHouseholdAccess(
    supabase,
    taskId!,
    memberIds
  );
  if (!hasAccess) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const parsed = await parseBody(request, completionSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { completed_date, note, mood, value } = parsed.data;
  const dateStr = completed_date || formatDateOnly(new Date());

  // Get the task
  const { data: task } = await platform(supabase)
    .from("tasks")
    .select("id, recurrence_source_id, is_habit, recurrence_rule, due_date, recurrence_mode")
    .eq("id", taskId!)
    .single();

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Insert completion
  const { data: completion, error } = await platform(supabase)
    .from("task_completions")
    .insert({
      task_id: taskId!,
      recurrence_source_id: task.recurrence_source_id || task.id,
      completed_by: user.id,
      completed_date: dateStr,
      note,
      mood,
      value,
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  // For habit-type tasks, recalculate streak and award XP
  let streakResult = null;
  if (task.is_habit) {
    // Determine frequency from recurrence rule
    const targetType = inferFrequencyFromRRule(task.recurrence_rule);
    streakResult = await recalculateTaskStreak(
      supabase,
      taskId!,
      1,
      targetType,
      dateStr
    );

    // Award habit check-in XP
    const baseXp = 10;
    const streakBonus =
      streakResult.current_streak >= 7
        ? 15
        : streakResult.current_streak >= 3
          ? 5
          : 0;

    await awardXp(
      supabase,
      user.id,
      baseXp + streakBonus,
      "habit_check_in",
      `Habit check-in${streakBonus > 0 ? ` (${streakResult.current_streak}d streak bonus!)` : ""}`,
      "task",
      taskId!
    ).catch((err) => console.error("XP award error:", err));

    // Check streak achievements
    await checkAchievements(supabase, user.id, "streak", {
      streak: streakResult.current_streak,
    }).catch((err) => console.error("Achievement check error:", err));

    // Advance due_date to next occurrence so the habit shows correctly tomorrow
    if (task.recurrence_rule) {
      const anchor = task.due_date
        ? parseDateLocal(task.due_date)
        : new Date();
      // Keep advancing until we get a date after today
      let nextDate = getNextOccurrence(task.recurrence_rule, anchor);
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      while (nextDate && nextDate <= todayMidnight) {
        nextDate = getNextOccurrence(task.recurrence_rule, nextDate);
      }
      if (nextDate) {
        await platform(supabase)
          .from("tasks")
          .update({ due_date: formatDateOnly(nextDate) })
          .eq("id", taskId!);
      }
    }
  }

  return NextResponse.json(
    {
      completion,
      streak: streakResult,
    },
    { status: 201 }
  );
});

// =============================================================
// DELETE /api/tasks/:id/completions — Undo a completion for a date
// =============================================================
export const DELETE = withAuth(
  async (request, { supabase, user, ctx }, params) => {
    const taskId = params?.id;
    const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
    const hasAccess = await verifyTaskHouseholdAccess(
      supabase,
      taskId!,
      memberIds
    );
    if (!hasAccess) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const dateStr = request.nextUrl.searchParams.get("date");
    if (!dateStr) {
      return NextResponse.json(
        { error: "date query param required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const { error } = await platform(supabase)
      .from("task_completions")
      .delete()
      .eq("task_id", taskId!)
      .eq("completed_by", user.id)
      .eq("completed_date", dateStr);

    if (error) {
      console.error(error.message);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // Recalculate streak if habit
    const { data: task } = await platform(supabase)
      .from("tasks")
      .select("is_habit, recurrence_rule")
      .eq("id", taskId!)
      .single();

    let streakResult = null;
    if (task?.is_habit) {
      const targetType = inferFrequencyFromRRule(task.recurrence_rule);
      streakResult = await recalculateTaskStreak(
        supabase,
        taskId!,
        1,
        targetType,
        dateStr
      );

      // Restore due_date to the unchecked date so habit shows as due again
      await platform(supabase)
        .from("tasks")
        .update({ due_date: dateStr })
        .eq("id", taskId!);
    }

    return NextResponse.json({ success: true, streak: streakResult });
  }
);

/**
 * Infer frequency type from RRULE string.
 * FREQ=DAILY → daily, FREQ=WEEKLY → weekly, FREQ=MONTHLY → monthly
 */
function inferFrequencyFromRRule(
  rrule: string | null
): "daily" | "weekly" | "monthly" {
  if (!rrule) return "daily";
  if (rrule.includes("FREQ=WEEKLY")) return "weekly";
  if (rrule.includes("FREQ=MONTHLY")) return "monthly";
  return "daily";
}
