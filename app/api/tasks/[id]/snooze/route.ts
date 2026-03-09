import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";

/**
 * Resolve a snooze target like "tomorrow", "weekend", "next_week" to a date string.
 */
function resolveSnoozeTarget(target: string, tz?: string): string | null {
  // If it's already a YYYY-MM-DD date, return it
  if (/^\d{4}-\d{2}-\d{2}$/.test(target)) return target;

  const now = new Date();
  // Use timezone-aware "today" if provided
  let todayStr: string;
  if (tz) {
    todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } else {
    todayStr = now.toISOString().split("T")[0];
  }
  const [y, m, d] = todayStr.split("-").map(Number);
  const today = new Date(y, m - 1, d);

  switch (target) {
    case "tomorrow": {
      const t = new Date(today);
      t.setDate(t.getDate() + 1);
      return formatDate(t);
    }
    case "weekend": {
      // Next Saturday
      const t = new Date(today);
      const daysUntilSat = (6 - t.getDay() + 7) % 7 || 7;
      t.setDate(t.getDate() + daysUntilSat);
      return formatDate(t);
    }
    case "next_week": {
      // Next Monday
      const t = new Date(today);
      const daysUntilMon = (1 - t.getDay() + 7) % 7 || 7;
      t.setDate(t.getDate() + daysUntilMon);
      return formatDate(t);
    }
    default:
      return null;
  }
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDailyHabit(task: { is_habit?: boolean; recurrence_rule?: string | null }): boolean {
  if (!task.is_habit || !task.recurrence_rule) return false;
  return task.recurrence_rule.includes("FREQ=DAILY");
}

/**
 * POST /api/tasks/[id]/snooze
 * Snooze a task until a target date.
 * Body: { until: "tomorrow" | "weekend" | "next_week" | "YYYY-MM-DD", tz?: string }
 */
export const POST = withAuth(async (request, { supabase, user }, params) => {
  const taskId = params!.id;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { until, tz } = body;
  if (!until || typeof until !== "string") {
    return NextResponse.json({ error: "until is required (tomorrow, weekend, next_week, or YYYY-MM-DD)" }, { status: 400 });
  }

  const snoozedUntil = resolveSnoozeTarget(until, tz);
  if (!snoozedUntil) {
    return NextResponse.json({ error: "Invalid snooze target" }, { status: 400 });
  }

  // Fetch task
  const { data: task, error: fetchErr } = await platform(supabase)
    .from("tasks")
    .select("id, due_date, is_habit, recurrence_rule, snoozed_until, snooze_count")
    .eq("id", taskId)
    .single();

  if (fetchErr || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const today = tz
    ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
    : new Date().toISOString().split("T")[0];

  // Determine snooze type
  const isSkip = isDailyHabit(task);
  const snoozeType = isSkip ? "skip" : "defer";

  // Build task update
  const updateFields: Record<string, unknown> = {
    snoozed_until: snoozedUntil,
    snooze_count: (task.snooze_count || 0) + 1,
  };

  // For non-daily-habit tasks, also move the due date
  if (!isSkip) {
    updateFields.due_date = snoozedUntil;
  }

  // Update task
  const { data: updated, error: updateErr } = await platform(supabase)
    .from("tasks")
    .update(updateFields)
    .eq("id", taskId)
    .select("*")
    .single();

  if (updateErr) {
    console.error(updateErr.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Record snooze history
  await platform(supabase)
    .from("task_snoozes")
    .insert({
      task_id: taskId,
      snoozed_by: user.id,
      original_due_date: task.due_date || null,
      snoozed_from: today,
      snoozed_until: snoozedUntil,
      snooze_type: snoozeType,
    });

  // Log activity
  await logActivity(supabase, {
    entity_type: "task",
    entity_id: taskId,
    action: "snoozed",
    performed_by: user.id,
    metadata: {
      snoozed_until: snoozedUntil,
      snooze_type: snoozeType,
      original_due_date: task.due_date,
      snooze_count: (task.snooze_count || 0) + 1,
    },
  }).catch(console.error);

  return NextResponse.json({ task: updated, snooze_type: snoozeType });
});

/**
 * DELETE /api/tasks/[id]/snooze
 * Unsnooze a task — clear snoozed_until and optionally restore due date.
 */
export const DELETE = withAuth(async (request, { supabase, user }, params) => {
  const taskId = params!.id;

  // Get latest snooze record to check if we need to restore due date
  const { data: lastSnooze } = await platform(supabase)
    .from("task_snoozes")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const updateFields: Record<string, unknown> = {
    snoozed_until: null,
  };

  // Restore original due date if this was a defer snooze
  if (lastSnooze && lastSnooze.snooze_type === "defer" && lastSnooze.original_due_date) {
    updateFields.due_date = lastSnooze.original_due_date;
  }

  const { data: updated, error } = await platform(supabase)
    .from("tasks")
    .update(updateFields)
    .eq("id", taskId)
    .select("*")
    .single();

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: taskId,
    action: "unsnoozed",
    performed_by: user.id,
  }).catch(console.error);

  return NextResponse.json({ task: updated });
});
