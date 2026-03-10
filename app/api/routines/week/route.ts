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
  const diff = day === 0 ? -6 : 1 - day;
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

function getYearStart(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

function getYearEnd(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31);
}

function getQuarterStart(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

function getQuarterEnd(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), (q + 1) * 3, 0);
}

type Frequency = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "biannual" | "yearly";

function inferFrequency(rrule?: string | null): Frequency {
  if (!rrule) return "daily";
  const cleaned = rrule.replace(/^RRULE:/i, "");
  const parts = Object.fromEntries(cleaned.split(";").map((p) => p.split("=")));
  const freq = parts.FREQ;
  const interval = parseInt(parts.INTERVAL || "1");

  if (freq === "YEARLY") return "yearly";
  if (freq === "MONTHLY") {
    if (interval >= 6) return "biannual";
    if (interval >= 3) return "quarterly";
    return "monthly";
  }
  if (freq === "WEEKLY") {
    if (interval >= 2) return "biweekly";
    return "weekly";
  }
  return "daily";
}

/** For sorting in the checklist: daily tasks first, then less frequent */
const FREQ_ORDER: Record<Frequency, number> = {
  daily: 0, weekly: 1, biweekly: 2, monthly: 3, quarterly: 4, biannual: 5, yearly: 6,
};

/**
 * Compute satisfaction for a routine within its natural period.
 */
function computeSatisfaction(
  frequency: Frequency,
  completionDates: string[],
  todayStr: string,
  weekStart: Date,
  weekEnd: Date
): {
  completions: Record<string, boolean>;
  period_satisfied: boolean;
  satisfied_on: string | null;
  period_label: string;
} {
  const completions: Record<string, boolean> = {};

  // Mark actual completions within the visible week
  for (const date of completionDates) {
    completions[date] = true;
  }

  const today = new Date(todayStr + "T12:00:00");

  if (frequency === "daily") {
    const doneToday = completionDates.includes(todayStr);
    return {
      completions,
      period_satisfied: doneToday,
      satisfied_on: doneToday ? todayStr : null,
      period_label: "today",
    };
  }

  if (frequency === "weekly" || frequency === "biweekly") {
    const ws = toDateStr(weekStart);
    const we = toDateStr(weekEnd);
    const completedThisWeek = completionDates.filter((d) => d >= ws && d <= we);
    if (completedThisWeek.length > 0) {
      return {
        completions,
        period_satisfied: true,
        satisfied_on: completedThisWeek.sort()[0],
        period_label: "this week",
      };
    }
    return { completions, period_satisfied: false, satisfied_on: null, period_label: "this week" };
  }

  if (frequency === "monthly") {
    const ms = toDateStr(getMonthStart(today));
    const me = toDateStr(getMonthEnd(today));
    const completedThisMonth = completionDates.filter((d) => d >= ms && d <= me);
    if (completedThisMonth.length > 0) {
      return {
        completions,
        period_satisfied: true,
        satisfied_on: completedThisMonth.sort()[0],
        period_label: "this month",
      };
    }
    return { completions, period_satisfied: false, satisfied_on: null, period_label: "this month" };
  }

  if (frequency === "quarterly") {
    const qs = toDateStr(getQuarterStart(today));
    const qe = toDateStr(getQuarterEnd(today));
    const completedThisQuarter = completionDates.filter((d) => d >= qs && d <= qe);
    if (completedThisQuarter.length > 0) {
      return {
        completions,
        period_satisfied: true,
        satisfied_on: completedThisQuarter.sort()[0],
        period_label: "this quarter",
      };
    }
    return { completions, period_satisfied: false, satisfied_on: null, period_label: "this quarter" };
  }

  if (frequency === "biannual") {
    const halfStart = today.getMonth() < 6
      ? new Date(today.getFullYear(), 0, 1)
      : new Date(today.getFullYear(), 6, 1);
    const halfEnd = today.getMonth() < 6
      ? new Date(today.getFullYear(), 5, 30)
      : new Date(today.getFullYear(), 11, 31);
    const hs = toDateStr(halfStart);
    const he = toDateStr(halfEnd);
    const completedThisHalf = completionDates.filter((d) => d >= hs && d <= he);
    if (completedThisHalf.length > 0) {
      return {
        completions,
        period_satisfied: true,
        satisfied_on: completedThisHalf.sort()[0],
        period_label: "this half-year",
      };
    }
    return { completions, period_satisfied: false, satisfied_on: null, period_label: "this half-year" };
  }

  if (frequency === "yearly") {
    const ys = toDateStr(getYearStart(today));
    const ye = toDateStr(getYearEnd(today));
    const completedThisYear = completionDates.filter((d) => d >= ys && d <= ye);
    if (completedThisYear.length > 0) {
      return {
        completions,
        period_satisfied: true,
        satisfied_on: completedThisYear.sort()[0],
        period_label: "this year",
      };
    }
    return { completions, period_satisfied: false, satisfied_on: null, period_label: "this year" };
  }

  return { completions, period_satisfied: false, satisfied_on: null, period_label: "" };
}

// GET /api/routines/week?date=2026-03-09
export const GET = withAuth(async (request: NextRequest, { supabase, user, ctx }) => {
  const params = request.nextUrl.searchParams;
  const dateParam = params.get("date") || toDateStr(new Date());

  const targetDate = new Date(dateParam + "T12:00:00");
  const todayStr = toDateStr(new Date());
  const weekStart = getWeekStart(targetDate);
  const weekEnd = getWeekEnd(weekStart);
  const weekStartStr = toDateStr(weekStart);
  const weekEndStr = toDateStr(weekEnd);

  // Use year-wide window for completions (covers yearly routines)
  const yearStart = getYearStart(targetDate);
  const yearEnd = getYearEnd(targetDate);
  const yearStartStr = toDateStr(yearStart);
  const yearEndStr = toDateStr(yearEnd);

  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const includeCompleted = params.get("include_completed") === "true";

  // 1. Fetch routines (habit tasks + recurring tasks)
  let routineQuery = platform(supabase)
    .from("tasks")
    .select(`
      *,
      domain_memberships:task_domain_memberships(domain_slug),
      tags:task_tags(*)
    `)
    .in("created_by", memberIds)
    .is("parent_task_id", null)
    .or("is_habit.eq.true,recurrence_rule.not.is.null")
    .order("title");

  // By default only active routines; timeline passes include_completed=true
  if (!includeCompleted) {
    routineQuery = routineQuery.is("completed_at", null);
  }

  const { data: routines, error: routinesError } = await routineQuery;

  if (routinesError) {
    console.error("Failed to fetch routines:", routinesError.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // 2. Fetch completions for the year window
  const routineIds = (routines || []).map((r: any) => r.id);
  let completionsMap: Record<string, string[]> = {};

  if (routineIds.length > 0) {
    const { data: completions } = await platform(supabase)
      .from("task_completions")
      .select("task_id, completed_date")
      .in("task_id", routineIds)
      .gte("completed_date", yearStartStr)
      .lte("completed_date", yearEndStr);

    for (const c of completions || []) {
      if (!completionsMap[c.task_id]) completionsMap[c.task_id] = [];
      completionsMap[c.task_id].push(c.completed_date);
    }

    // Also check completed recurrence instances
    for (const r of routines || []) {
      const sourceId = r.recurrence_source_id || r.id;
      let instanceQuery = platform(supabase)
        .from("tasks")
        .select("due_date")
        .or(`id.eq.${sourceId},recurrence_source_id.eq.${sourceId}`)
        .not("completed_at", "is", null)
        .not("due_date", "is", null)
        .lte("due_date", yearEndStr);

      // Only count completions for THIS or future occurrence, not previous ones
      if (r.due_date) {
        instanceQuery = instanceQuery.gte("due_date", r.due_date);
      } else {
        instanceQuery = instanceQuery.gte("due_date", yearStartStr);
      }

      const { data: completedInstances } = await instanceQuery;

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
    const satisfaction = computeSatisfaction(frequency, completionDates, todayStr, weekStart, weekEnd);

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
      due_date: routine.due_date,
      snoozed_until: routine.snoozed_until || null,
      completions: satisfaction.completions,
      period_satisfied: satisfaction.period_satisfied,
      satisfied_on: satisfaction.satisfied_on,
      period_label: satisfaction.period_label,
    };
  });

  // 5. Sort: unsatisfied first, then by frequency (daily -> yearly)
  result.sort((a: any, b: any) => {
    // Unsatisfied first
    if (a.period_satisfied !== b.period_satisfied) return a.period_satisfied ? 1 : -1;
    // Then by frequency
    return (FREQ_ORDER[a.frequency as Frequency] || 0) - (FREQ_ORDER[b.frequency as Frequency] || 0);
  });

  return NextResponse.json({
    routines: result,
    week_start: weekStartStr,
    week_end: weekEndStr,
    today: todayStr,
  });
});
