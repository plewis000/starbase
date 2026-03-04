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
  // Parse as UTC midnight to avoid local timezone shifts
  return new Date(parts + "T00:00:00Z");
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
