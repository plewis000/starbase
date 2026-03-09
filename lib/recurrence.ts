/**
 * RRULE-based recurrence utilities powered by the `rrule` npm package.
 * Replaces the previous hand-rolled parser with full RFC 5545 support.
 */

import { RRule, rrulestr } from "rrule";

/**
 * Parse an RRULE string into an RRule instance.
 * Accepts strings with or without the "RRULE:" prefix.
 * Returns null if the string cannot be parsed.
 */
export function parseRRule(rruleString: string): RRule | null {
  try {
    // Ensure the string has the RRULE: prefix that rrulestr expects
    const normalized = rruleString.startsWith("RRULE:")
      ? rruleString
      : `RRULE:${rruleString}`;
    return rrulestr(normalized) as RRule;
  } catch {
    console.error("RRULE parse error for:", rruleString);
    return null;
  }
}

/**
 * Get the next occurrence of a recurring event after a given date.
 * Returns null if the rule is invalid or there is no next occurrence
 * (e.g. COUNT exhausted or UNTIL passed).
 *
 * @param afterDate - Required. The date to find the next occurrence after.
 *   For fixed recurrence: pass the task's due_date.
 *   For flexible recurrence: pass the completion date.
 * @param timezone - Optional IANA timezone. Used to anchor "after" to midnight in that timezone.
 */
export function getNextOccurrence(
  rruleString: string,
  afterDate: Date,
  timezone?: string
): Date | null {
  const rule = parseRRule(rruleString);
  if (!rule) return null;

  // If timezone is provided, anchor afterDate to midnight in that timezone
  const anchor = timezone ? midnightInTimezone(afterDate, timezone) : afterDate;
  const next = rule.after(anchor, false);
  return next ?? null;
}

/**
 * Get midnight of a date in a given timezone.
 * Uses Intl.DateTimeFormat("en-CA") which outputs YYYY-MM-DD format.
 */
export function midnightInTimezone(date: Date, timezone: string): Date {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return new Date(`${dateStr}T00:00:00`);
}

/**
 * Parse a YYYY-MM-DD string as a local date (no UTC conversion).
 */
export function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format a Date as a local date string (YYYY-MM-DD).
 * Uses local date parts (not UTC) to avoid off-by-one errors near midnight.
 */
export function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
