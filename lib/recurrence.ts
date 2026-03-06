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
 * Format a Date as an ISO date string (YYYY-MM-DD).
 */
export function formatDateOnly(date: Date): string {
  return date.toISOString().split("T")[0];
}
