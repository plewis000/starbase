/**
 * Timezone-aware date utilities using Intl.DateTimeFormat.
 * No external libraries needed.
 */

/** Get "today" (midnight) in a specific timezone as a Date object. */
export function todayInTimezone(tz: string): Date {
  // Get the current date parts in the target timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.format(new Date()); // "2026-03-04"
  // Parse as local midnight so dateKey() (which uses local getters) stays consistent
  const [y, m, d] = parts.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format a date string for display in a specific timezone. */
export function formatInTimezone(
  dateStr: string,
  tz: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    ...options,
  }).format(date);
}

/**
 * Calculate day difference between a date string (YYYY-MM-DD) and today.
 * Parses date-only strings as calendar dates (not UTC) to avoid off-by-one errors.
 */
export function dayDiff(dateString: string): number {
  // Parse YYYY-MM-DD as local calendar date, not UTC
  const parts = dateString.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

/** Human-readable relative date: "Today", "Tomorrow", "Overdue (2d ago)", "In 5d" */
export function formatRelativeDate(dateString?: string): string {
  if (!dateString) return "No date";
  const diff = dayDiff(dateString);
  if (diff < 0) return `Overdue (${Math.abs(diff)}d ago)`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 7) return `In ${diff}d`;
  const parts = dateString.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Color class for date urgency */
export function getDateColor(dateString?: string): string {
  if (!dateString) return "text-dungeon-400";
  const diff = dayDiff(dateString);
  if (diff < 0) return "text-red-400";
  if (diff <= 1) return "text-amber-400";
  return "text-dungeon-400";
}
