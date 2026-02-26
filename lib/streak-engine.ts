import { SupabaseClient } from "@supabase/supabase-js";
import { platform } from "@/lib/supabase/schemas";

// ---- TYPES ----

interface HabitFrequency {
  target_type: "daily" | "weekly" | "monthly";
  default_target: number;
}

interface StreakResult {
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  last_completed_at: string | null;
  completion_rate_30d: number;
  completion_rate_7d: number;
}

interface PeriodResult {
  period_start: string;
  period_end: string;
  completions: number;
  target: number;
  met: boolean;
}

// ---- HELPERS ----

// Returns the ISO date string for a Date object (YYYY-MM-DD)
function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Returns start of the ISO week (Monday) for a given date
function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Returns start of the month for a given date
function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// ---- STREAK CALCULATION ----

/**
 * Calculate streak data for a habit from its check-in history.
 * Streaks are calculated based on the habit's frequency:
 * - daily: consecutive days with a check-in
 * - weekly: consecutive weeks meeting the target count
 * - monthly: consecutive months meeting the target count
 */
export function calculateStreak(
  checkDates: string[],
  targetCount: number,
  targetType: "daily" | "weekly" | "monthly",
  startedOn: string
): StreakResult {
  if (checkDates.length === 0) {
    return {
      current_streak: 0,
      longest_streak: 0,
      total_completions: checkDates.length,
      last_completed_at: null,
      completion_rate_30d: 0,
      completion_rate_7d: 0,
    };
  }

  const sorted = [...checkDates].sort();
  const lastCompleted = sorted[sorted.length - 1];
  const today = new Date();

  // Build period results based on frequency type
  const periods = buildPeriods(sorted, targetCount, targetType, startedOn);

  // Calculate current streak (consecutive met periods from today backwards)
  let currentStreak = 0;
  const currentPeriodKey = getPeriodKey(today, targetType);
  let checkingKey = currentPeriodKey;

  // Walk backwards through periods
  for (let i = periods.length - 1; i >= 0; i--) {
    const period = periods[i];
    const periodKey = getPeriodKey(new Date(period.period_start), targetType);

    if (periodKey === checkingKey) {
      if (period.met) {
        currentStreak++;
        checkingKey = getPreviousPeriodKey(checkingKey, targetType);
      } else {
        // Current period not met yet — check if it's the active period
        // (today is in this period, so it may still be met)
        if (periodKey === currentPeriodKey && period.completions > 0) {
          // Partial progress in current period, don't break the streak yet
          // but don't count it either — check the previous period
          checkingKey = getPreviousPeriodKey(checkingKey, targetType);
          continue;
        }
        break;
      }
    } else {
      // Gap in periods — streak is broken
      break;
    }
  }

  // Calculate longest streak
  let longestStreak = 0;
  let runningStreak = 0;
  for (const period of periods) {
    if (period.met) {
      runningStreak++;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  // Completion rates
  const rate30d = calculateCompletionRate(sorted, targetCount, targetType, 30);
  const rate7d = calculateCompletionRate(sorted, targetCount, targetType, 7);

  return {
    current_streak: currentStreak,
    longest_streak: Math.max(longestStreak, currentStreak),
    total_completions: checkDates.length,
    last_completed_at: lastCompleted,
    completion_rate_30d: rate30d,
    completion_rate_7d: rate7d,
  };
}

// ---- PERIOD BUILDING ----

function buildPeriods(
  sortedDates: string[],
  targetCount: number,
  targetType: "daily" | "weekly" | "monthly",
  startedOn: string
): PeriodResult[] {
  if (sortedDates.length === 0) return [];

  const periods: PeriodResult[] = [];
  const dateSet = new Set(sortedDates);

  if (targetType === "daily") {
    // Each day is a period; target is always 1
    const start = new Date(startedOn);
    const end = new Date();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = toDateStr(d);
      periods.push({
        period_start: ds,
        period_end: ds,
        completions: dateSet.has(ds) ? 1 : 0,
        target: 1,
        met: dateSet.has(ds),
      });
    }
  } else if (targetType === "weekly") {
    const start = getWeekStart(new Date(startedOn));
    const end = new Date();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
      const weekEnd = new Date(d);
      weekEnd.setDate(weekEnd.getDate() + 6);
      let count = 0;
      for (let wd = new Date(d); wd <= weekEnd && wd <= end; wd.setDate(wd.getDate() + 1)) {
        if (dateSet.has(toDateStr(wd))) count++;
      }
      periods.push({
        period_start: toDateStr(d),
        period_end: toDateStr(weekEnd),
        completions: count,
        target: targetCount,
        met: count >= targetCount,
      });
    }
  } else {
    // monthly
    const startDate = new Date(startedOn);
    const end = new Date();
    let current = getMonthStart(startDate);
    while (current <= end) {
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      let count = 0;
      for (let d = new Date(current); d <= monthEnd && d <= end; d.setDate(d.getDate() + 1)) {
        if (dateSet.has(toDateStr(d))) count++;
      }
      periods.push({
        period_start: toDateStr(current),
        period_end: toDateStr(monthEnd),
        completions: count,
        target: targetCount,
        met: count >= targetCount,
      });
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
  }

  return periods;
}

// ---- PERIOD KEY HELPERS ----

function getPeriodKey(d: Date, targetType: "daily" | "weekly" | "monthly"): string {
  if (targetType === "daily") return toDateStr(d);
  if (targetType === "weekly") return toDateStr(getWeekStart(d));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getPreviousPeriodKey(key: string, targetType: "daily" | "weekly" | "monthly"): string {
  if (targetType === "daily") {
    const d = new Date(key);
    d.setDate(d.getDate() - 1);
    return toDateStr(d);
  }
  if (targetType === "weekly") {
    const d = new Date(key);
    d.setDate(d.getDate() - 7);
    return toDateStr(d);
  }
  // monthly
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---- COMPLETION RATE ----

function calculateCompletionRate(
  sortedDates: string[],
  targetCount: number,
  targetType: "daily" | "weekly" | "monthly",
  days: number
): number {
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = toDateStr(cutoff);

  const recentDates = sortedDates.filter((d) => d >= cutoffStr);

  if (targetType === "daily") {
    return Math.round((recentDates.length / days) * 100);
  }

  if (targetType === "weekly") {
    const weeks = Math.max(1, Math.ceil(days / 7));
    const periodsWithTarget = weeks * targetCount;
    return Math.round((recentDates.length / periodsWithTarget) * 100);
  }

  // monthly
  const months = Math.max(1, Math.ceil(days / 30));
  const periodsWithTarget = months * targetCount;
  return Math.round((recentDates.length / periodsWithTarget) * 100);
}

// ---- DATABASE UPDATE ----

/**
 * Recalculate and persist streak data for a habit.
 * Called after every check-in insert/delete.
 */
export async function recalculateAndUpdateStreak(
  supabase: SupabaseClient,
  habitId: string,
  targetCount: number,
  targetType: "daily" | "weekly" | "monthly",
  startedOn: string
): Promise<StreakResult> {
  // Fetch all check-in dates for this habit
  const { data: checkIns } = await platform(supabase)
    .from("habit_check_ins")
    .select("check_date")
    .eq("habit_id", habitId)
    .order("check_date", { ascending: true });

  const dates = (checkIns || []).map((c: { check_date: string }) => c.check_date);
  const result = calculateStreak(dates, targetCount, targetType, startedOn);

  // Update the denormalized streak fields on the habit
  await platform(supabase)
    .from("habits")
    .update({
      current_streak: result.current_streak,
      longest_streak: result.longest_streak,
      total_completions: result.total_completions,
      last_completed_at: result.last_completed_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", habitId);

  return result;
}

/**
 * Get the streak and completion data for a habit without updating the DB.
 * Used for read-only analytics.
 */
export async function getStreakData(
  supabase: SupabaseClient,
  habitId: string,
  targetCount: number,
  targetType: "daily" | "weekly" | "monthly",
  startedOn: string
): Promise<StreakResult> {
  const { data: checkIns } = await platform(supabase)
    .from("habit_check_ins")
    .select("check_date")
    .eq("habit_id", habitId)
    .order("check_date", { ascending: true });

  const dates = (checkIns || []).map((c: { check_date: string }) => c.check_date);
  return calculateStreak(dates, targetCount, targetType, startedOn);
}

/**
 * Get check-in history for a date range (for heatmap/calendar views).
 */
export async function getCheckInHistory(
  supabase: SupabaseClient,
  habitId: string,
  startDate: string,
  endDate: string
): Promise<Array<{ check_date: string; value: number | null; note: string | null; mood: string | null }>> {
  const { data } = await platform(supabase)
    .from("habit_check_ins")
    .select("check_date, value, note, mood")
    .eq("habit_id", habitId)
    .gte("check_date", startDate)
    .lte("check_date", endDate)
    .order("check_date", { ascending: true });

  return data || [];
}
