import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds } from "@/lib/household";
import { getConfigLookups, enrichTasks } from "@/lib/task-enrichment";
import { inferFrequencyName } from "@/lib/habit-tasks";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = start of week
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d;
}

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

type Frequency = "daily" | "weekly" | "monthly";

function inferFrequency(rrule?: string | null): Frequency {
  if (!rrule) return "daily";
  if (rrule.includes("FREQ=WEEKLY")) return "weekly";
  if (rrule.includes("FREQ=MONTHLY")) return "monthly";
  return "daily";
}

/**
 * Determine if a routine's period is satisfied given completions in the window.
 * Returns which dates are "actually completed" and which are "satisfied by proxy".
 */
function computeSatisfaction(
  frequency: Frequency,
  completionDates: string[],
  weekStart: Date,
  weekEnd: Date
): {
  completions: Record<string, boolean>;
  satisfied: Record<string, boolean>;
  period_satisfied: boolean;
  satisfied_on: string | null;
} {
  const completions: Record<string, boolean> = {};
  const satisfied: Record<string, boolean> = {};

  // Mark actual completions
  for (const date of completionDates) {
    if (date >= toDateStr(weekStart) && date <= toDateStr(weekEnd)) {
      completions[date] = true;
    }
  }

  if (frequency === "daily") {
    // Daily: each day is independent
    return {
      completions,
      satisfied: {},
      period_satisfied: false, // not meaningful for daily in week context
      satisfied_on: null,
    };
  }

  if (frequency === "weekly") {
    // Check if any completion exists this week
    const weekStartStr = toDateStr(weekStart);
    const weekEndStr = toDateStr(weekEnd);
    const completedThisWeek = completionDates.filter(
      (d) => d >= weekStartStr && d <= weekEndStr
    );

    if (completedThisWeek.length > 0) {
      const firstCompletion = completedThisWeek.sort()[0];
      // Mark all days after the completion as "satisfied"
      const cursor = new Date(weekStart);
      while (cursor <= weekEnd) {
        const ds = toDateStr(cursor);
        if (ds !== firstCompletion && !completions[ds]) {
          satisfied[ds] = true;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return {
        completions,
        satisfied,
        period_satisfied: true,
        satisfied_on: firstCompletion,
      };
    }

    return { completions, satisfied, period_satisfied: false, satisfied_on: null };
  }

  if (frequency === "monthly") {
    // Check if any completion exists this month
    const monthStart = getMonthStart(weekStart);
    const monthEnd = getMonthEnd(weekStart);
    const monthStartStr = toDateStr(monthStart);
    const monthEndStr = toDateStr(monthEnd);
    const completedThisMonth = completionDates.filter(
      (d) => d >= monthStartStr && d <= monthEndStr
    );

    if (completedThisMonth.length > 0) {
      const firstCompletion = completedThisMonth.sort()[0];
      // All days in visible week range are satisfied
      const cursor = new Date(weekStart);
      while (cursor <= weekEnd) {
        const ds = toDateStr(cursor);
        if (!completions[ds]) {
          satisfied[ds] = true;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return {
        completions,
        satisfied,
        period_satisfied: true,
        satisfied_on: firstCompletion,
      };
    }

    return { completions, satisfied, period_satisfied: false, satisfied_on: null };
  }

  return { completions, satisfied, period_satisfied: false, satisfied_on: null };
}

// GET /api/routines/week?date=2026-03-09
export const GET = withAuth(async (request: NextRequest, { supabase, user, ctx }) => {
  const params = request.nextUrl.searchParams;
  const dateParam = params.get("date") || toDateStr(new Date());

  // Calculate week boundaries (Mon-Sun)
  const targetDate = new Date(dateParam + "T12:00:00");
  const weekStart = getWeekStart(targetDate);
  const weekEnd = getWeekEnd(weekStart);
  const weekStartStr = toDateStr(weekStart);
  const weekEndStr = toDateStr(weekEnd);

  // Also need month boundaries for monthly routines
  const monthStart = getMonthStart(targetDate);
  const monthEnd = getMonthEnd(targetDate);
  const monthStartStr = toDateStr(monthStart);
  const monthEndStr = toDateStr(monthEnd);

  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  // 1. Fetch all routines (habit tasks + recurring tasks)
  const { data: routines, error: routinesError } = await platform(supabase)
    .from("tasks")
    .select(`
      *,
      domain_memberships:task_domain_memberships(domain_slug),
      tags:task_tags(*)
    `)
    .in("created_by", memberIds)
    .is("parent_task_id", null)
    .or("is_habit.eq.true,recurrence_rule.not.is.null")
    .is("completed_at", null)
    .order("title");

  if (routinesError) {
    console.error("Failed to fetch routines:", routinesError.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // 2. Fetch completions for the broader window (month range for monthly routines)
  const routineIds = (routines || []).map((r: any) => r.id);

  let completionsMap: Record<string, string[]> = {};

  if (routineIds.length > 0) {
    // Use task_completions table
    const { data: completions } = await platform(supabase)
      .from("task_completions")
      .select("task_id, completed_date")
      .in("task_id", routineIds)
      .gte("completed_date", monthStartStr)
      .lte("completed_date", monthEndStr);

    for (const c of completions || []) {
      if (!completionsMap[c.task_id]) completionsMap[c.task_id] = [];
      completionsMap[c.task_id].push(c.completed_date);
    }

    // Also check for completed recurrence instances (tasks with recurrence_source_id)
    for (const r of routines || []) {
      const sourceId = r.recurrence_source_id || r.id;
      const { data: completedInstances } = await platform(supabase)
        .from("tasks")
        .select("due_date")
        .or(`id.eq.${sourceId},recurrence_source_id.eq.${sourceId}`)
        .not("completed_at", "is", null)
        .not("due_date", "is", null)
        .gte("due_date", monthStartStr)
        .lte("due_date", monthEndStr);

      for (const inst of completedInstances || []) {
        if (!completionsMap[r.id]) completionsMap[r.id] = [];
        if (!completionsMap[r.id].includes(inst.due_date)) {
          completionsMap[r.id].push(inst.due_date);
        }
      }
    }
  }

  // 3. Enrich routines with config data
  const lookups = await getConfigLookups(supabase);
  const enriched = enrichTasks(routines || [], lookups);

  // 4. Build response with satisfaction data
  const result = enriched.map((routine: any) => {
    const frequency = inferFrequency(routine.recurrence_rule);
    const completionDates = completionsMap[routine.id] || [];
    const satisfaction = computeSatisfaction(frequency, completionDates, weekStart, weekEnd);

    return {
      id: routine.id,
      title: routine.title,
      description: routine.description,
      frequency,
      frequency_name: inferFrequencyName(routine.recurrence_rule),
      recurrence_rule: routine.recurrence_rule,
      owner_ids: routine.owner_ids,
      owners: routine.owners,
      assignee: routine.assignee,
      tags: routine.tags,
      streak_current: routine.streak_current || 0,
      streak_longest: routine.streak_longest || 0,
      is_habit: routine.is_habit,
      created_at: routine.created_at,
      ...satisfaction,
    };
  });

  // 5. Sort: daily first, then weekly, then monthly
  const freqOrder: Record<string, number> = { daily: 0, weekly: 1, monthly: 2 };
  result.sort((a: any, b: any) => (freqOrder[a.frequency] || 0) - (freqOrder[b.frequency] || 0));

  return NextResponse.json({
    routines: result,
    week_start: weekStartStr,
    week_end: weekEndStr,
  });
});
