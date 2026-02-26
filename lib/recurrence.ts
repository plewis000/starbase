/**
 * Lightweight RRULE parser for common recurrence patterns.
 * Supports: FREQ=DAILY, WEEKLY, MONTHLY, YEARLY with INTERVAL and BYDAY.
 * For the Starbase household use case, this covers 95%+ of needs.
 */

interface ParsedRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  byday?: string[];
  bymonthday?: number[];
  count?: number;
  until?: Date;
}

const DAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

export function parseRRule(rruleString: string): ParsedRule | null {
  try {
    const raw = rruleString.replace(/^RRULE:/i, "");
    const parts = raw.split(";");
    const params: Record<string, string> = {};

    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key && value) {
        params[key.toUpperCase()] = value;
      }
    }

    const freq = params.FREQ as ParsedRule["freq"];
    if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
      return null;
    }

    const rule: ParsedRule = {
      freq,
      interval: params.INTERVAL ? parseInt(params.INTERVAL, 10) : 1,
    };

    if (params.BYDAY) {
      rule.byday = params.BYDAY.split(",");
    }
    if (params.BYMONTHDAY) {
      rule.bymonthday = params.BYMONTHDAY.split(",").map(Number);
    }
    if (params.COUNT) {
      rule.count = parseInt(params.COUNT, 10);
    }
    if (params.UNTIL) {
      rule.until = new Date(
        params.UNTIL.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
      );
    }

    return rule;
  } catch {
    console.error("RRULE parse error for:", rruleString);
    return null;
  }
}

export function getNextOccurrence(
  rruleString: string,
  afterDate: Date = new Date()
): Date | null {
  const rule = parseRRule(rruleString);
  if (!rule) return null;

  if (rule.until && afterDate > rule.until) {
    return null;
  }

  const next = new Date(afterDate);
  next.setHours(0, 0, 0, 0);

  switch (rule.freq) {
    case "DAILY":
      next.setDate(next.getDate() + rule.interval);
      break;

    case "WEEKLY":
      if (rule.byday && rule.byday.length > 0) {
        const targetDays = rule.byday
          .map((d) => DAY_MAP[d])
          .filter((d) => d !== undefined);
        let found = false;
        for (let i = 1; i <= 7 * rule.interval; i++) {
          const candidate = new Date(afterDate);
          candidate.setDate(candidate.getDate() + i);
          if (targetDays.includes(candidate.getDay())) {
            next.setTime(candidate.getTime());
            next.setHours(0, 0, 0, 0);
            found = true;
            break;
          }
        }
        if (!found) {
          next.setDate(next.getDate() + 7 * rule.interval);
        }
      } else {
        next.setDate(next.getDate() + 7 * rule.interval);
      }
      break;

    case "MONTHLY":
      if (rule.bymonthday && rule.bymonthday.length > 0) {
        next.setMonth(next.getMonth() + rule.interval);
        next.setDate(rule.bymonthday[0]);
      } else {
        next.setMonth(next.getMonth() + rule.interval);
      }
      break;

    case "YEARLY":
      next.setFullYear(next.getFullYear() + rule.interval);
      break;
  }

  if (rule.until && next > rule.until) {
    return null;
  }

  return next;
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().split("T")[0];
}
