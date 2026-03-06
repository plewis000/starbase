"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// In-memory cache shared across all hook instances
const prefCache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
// Tracks write versions per key — incremented by setValue, checked by fetch callbacks
const writeVersions = new Map<string, number>();

async function fetchPreference(key: string): Promise<unknown> {
  if (prefCache.has(key)) return prefCache.get(key);

  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const res = await fetch(`/api/user/preferences?keys=${encodeURIComponent(key)}`);
      if (!res.ok) return undefined;
      const data = await res.json();
      const value = data.preferences?.[key];
      // Only populate cache if no setValue call happened during fetch
      if (value !== undefined && !prefCache.has(key)) {
        prefCache.set(key, value);
      }
      return value;
    } catch {
      return undefined;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

async function savePreference(key: string, value: unknown): Promise<boolean> {
  try {
    const res = await fetch("/api/user/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useUserPreference<T>(key: string, defaultValue: T): {
  value: T;
  setValue: (v: T) => void;
  loading: boolean;
} {
  const [value, setValueState] = useState<T>(() => {
    const cached = prefCache.get(key);
    return cached !== undefined ? (cached as T) : defaultValue;
  });
  const [loading, setLoading] = useState(!prefCache.has(key));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prefCache.has(key)) {
      setValueState(prefCache.get(key) as T);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const versionAtStart = writeVersions.get(key) || 0;

    fetchPreference(key).then((fetched) => {
      if (cancelled) return;
      // If setValue was called during fetch, don't overwrite with stale API data
      const currentVersion = writeVersions.get(key) || 0;
      if (currentVersion > versionAtStart) {
        setLoading(false);
        return;
      }
      if (fetched !== undefined) {
        setValueState(fetched as T);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [key]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const setValue = useCallback((v: T) => {
    setValueState(v);
    prefCache.set(key, v);
    writeVersions.set(key, (writeVersions.get(key) || 0) + 1);

    // Debounce save to avoid rapid-fire API calls
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePreference(key, v);
    }, 500);
  }, [key]);

  return { value, setValue, loading };
}
