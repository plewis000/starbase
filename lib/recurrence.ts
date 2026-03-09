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
 */
export function getNextOccurrence(
  rruleString: string,
  afterDate: Date = new Date()
): Date | null {
  const rule = parseRRule(rruleString);
  if (!rule) return null;

  const next = rule.after(afterDate, false);
  return next ?? null;
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
