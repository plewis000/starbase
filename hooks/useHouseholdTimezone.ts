"use client";

import { useState, useEffect } from "react";

// Use browser timezone as fallback instead of hardcoded Chicago
function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Chicago";
  }
}

let cachedTimezone: string | null = null;
let tzFetchPromise: Promise<string> | null = null;

async function fetchTimezone(): Promise<string> {
  if (cachedTimezone) return cachedTimezone;
  if (tzFetchPromise) return tzFetchPromise;

  tzFetchPromise = (async () => {
    try {
      const res = await fetch("/api/household");
      if (!res.ok) {
        // Fall back to browser timezone, don't cache so we retry next time
        return getBrowserTimezone();
      }
      const data = await res.json();
      cachedTimezone = data.household?.timezone || getBrowserTimezone();
      return cachedTimezone!;
    } catch {
      return getBrowserTimezone();
    } finally {
      tzFetchPromise = null;
    }
  })();

  return tzFetchPromise;
}

export function useHouseholdTimezone(): { timezone: string; loading: boolean } {
  const [timezone, setTimezone] = useState(cachedTimezone || getBrowserTimezone());
  const [loading, setLoading] = useState(!cachedTimezone);

  useEffect(() => {
    if (cachedTimezone) {
      setTimezone(cachedTimezone);
      setLoading(false);
      return;
    }
    fetchTimezone().then((tz) => {
      setTimezone(tz);
      setLoading(false);
    });
  }, []);

  return { timezone, loading };
}
