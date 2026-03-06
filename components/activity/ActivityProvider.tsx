"use client";

import React, { createContext, useContext, useMemo } from "react";

interface ActivityContextValue {
  token: string;
  // Wrapper for fetch that adds the Discord auth header
  activityFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used within ActivityProvider");
  return ctx;
}

export default function ActivityProvider({
  token,
  children,
}: {
  token: string;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      token,
      activityFetch: (url: string, init?: RequestInit) =>
        fetch(url, {
          ...init,
          headers: {
            ...init?.headers,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
    }),
    [token]
  );

  return (
    <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>
  );
}
