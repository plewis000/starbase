"use client";

import { useState, useEffect } from "react";

let cachedTimezone: string | null = null;
let tzFetchPromise: Promise<string> | null = null;

async function fetchTimezone(): Promise<string> {
  if (cachedTimezone) return cachedTimezone;
  if (tzFetchPromise) return tzFetchPromise;

  tzFetchPromise = (async () => {
    try {
      const res = await fetch("/api/household");
      if (!res.ok) return "America/Chicago";
      const data = await res.json();
      cachedTimezone = data.household?.timezone || "America/Chicago";
      return cachedTimezone!;
    } catch {
      return "America/Chicago";
    } finally {
      tzFetchPromise = null;
    }
  })();

  return tzFetchPromise;
}

export function useHouseholdTimezone(): { timezone: string; loading: boolean } {
  const [timezone, setTimezone] = useState(cachedTimezone || "America/Chicago");
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
