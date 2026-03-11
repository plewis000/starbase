"use client";

import React, { useState, useEffect, useMemo } from "react";

interface Routine {
  id: string;
  title: string;
  frequency: string;
  frequency_name: string;
  streak_current: number;
  completions: Record<string, boolean>;
}

interface Props {
  onSelectRoutine?: (id: string) => void;
  refreshTrigger?: number;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

const FREQ_DOT_COLORS: Record<string, { done: string; missed: string }> = {
  daily: { done: "bg-blue-500", missed: "bg-dungeon-800/60" },
  weekly: { done: "bg-purple-500", missed: "bg-dungeon-800/60" },
  biweekly: { done: "bg-violet-500", missed: "bg-dungeon-800/60" },
  monthly: { done: "bg-amber-500", missed: "bg-dungeon-800/60" },
  quarterly: { done: "bg-orange-500", missed: "bg-dungeon-800/60" },
  biannual: { done: "bg-rose-500", missed: "bg-dungeon-800/60" },
  yearly: { done: "bg-emerald-500", missed: "bg-dungeon-800/60" },
};

const FREQ_BADGE: Record<string, string> = {
  daily: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  weekly: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  biweekly: "text-violet-400 bg-violet-400/10 border-violet-400/20",
  monthly: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  quarterly: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  biannual: "text-rose-400 bg-rose-400/10 border-rose-400/20",
  yearly: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
};

const FREQ_ORDER = ["daily", "weekly", "biweekly", "monthly", "quarterly", "biannual", "yearly"];

/**
 * For a given routine and date, determine its dot state:
 * - Daily: each day is independent
 * - Weekly: satisfied if any day in that Mon-Sun week was completed
 * - Monthly+: satisfied if any day in that month was completed
 * Returns: "done" | "missed" | "future" | "not-applicable"
 * "not-applicable" is for weekly/monthly routines where this isn't the anchor day
 */
function getDotState(
  routine: Routine,
  date: string,
  todayStr: string,
  allDates: string[]
): "done" | "missed" | "future" | "satisfied" {
  if (date > todayStr) return "future";

  if (routine.frequency === "daily") {
    return routine.completions[date] ? "done" : "missed";
  }

  if (routine.frequency === "weekly" || routine.frequency === "biweekly") {
    // Check if any day in this date's week has a completion
    const d = new Date(date + "T12:00:00");
    const ws = getWeekStart(d);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);
    const wsStr = toDateStr(ws);
    const weStr = toDateStr(we);

    const hasCompletion = Object.keys(routine.completions).some(
      (cd) => cd >= wsStr && cd <= weStr
    );

    // Is this the actual completion date?
    if (routine.completions[date]) return "done";
    // Is this week satisfied by another day?
    if (hasCompletion) return "satisfied";
    return "missed";
  }

  // Monthly, quarterly, biannual, yearly — check the month
  const month = date.slice(0, 7); // YYYY-MM
  const hasCompletion = Object.keys(routine.completions).some(
    (cd) => cd.startsWith(month)
  );

  if (routine.completions[date]) return "done";
  if (hasCompletion) return "satisfied";
  return "missed";
}

export default function RoutineMonthlyDots({ onSelectRoutine, refreshTrigger }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => new Date(), []);
  const todayStr = toDateStr(today);

  // Generate last 30 days
  const days = useMemo(() => {
    const result: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      result.push(toDateStr(d));
    }
    return result;
  }, [today]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const promises = [];
        for (let weekOffset = -4; weekOffset <= 0; weekOffset++) {
          const d = new Date(today);
          d.setDate(d.getDate() + weekOffset * 7);
          promises.push(
            fetch(`/api/routines/week?date=${toDateStr(d)}&include_completed=true`).then((r) => r.json())
          );
        }
        const results = await Promise.all(promises);

        const routineMap = new Map<string, Routine>();
        for (const result of results) {
          for (const r of result.routines || []) {
            if (!routineMap.has(r.id)) {
              routineMap.set(r.id, { ...r, completions: {} });
            }
            Object.assign(routineMap.get(r.id)!.completions, r.completions);
          }
        }

        // Sort by frequency order, then alphabetically
        const sorted = Array.from(routineMap.values()).sort((a, b) => {
          const freqDiff = FREQ_ORDER.indexOf(a.frequency) - FREQ_ORDER.indexOf(b.frequency);
          if (freqDiff !== 0) return freqDiff;
          return a.title.localeCompare(b.title);
        });

        setRoutines(sorted);
      } catch (err) {
        console.error("Failed to fetch:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [today, refreshTrigger]);

  // Group routines by frequency — must be before any conditional returns (React hooks rule)
  const grouped = useMemo(() => {
    const groups: Record<string, Routine[]> = {};
    for (const r of routines) {
      if (!groups[r.frequency]) groups[r.frequency] = [];
      groups[r.frequency].push(r);
    }
    return groups;
  }, [routines]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-2 border-dungeon-700 border-t-red-500 rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-bold text-slate-100 mb-4">Last 30 Days</h2>

      {/* Day labels (show every 5th) */}
      <div className="flex items-center gap-0 mb-1 pl-[180px]">
        {days.map((date, i) => (
          <div key={date} className="w-3 text-center">
            {i % 5 === 0 ? (
              <span className="text-[8px] text-dungeon-600">{parseInt(date.slice(8))}</span>
            ) : null}
          </div>
        ))}
      </div>

      {/* Routine rows grouped by frequency */}
      {FREQ_ORDER.map((freq) => {
        const items = grouped[freq];
        if (!items || items.length === 0) return null;
        const freqBadge = FREQ_BADGE[freq] || "";
        const colors = FREQ_DOT_COLORS[freq] || FREQ_DOT_COLORS.daily;

        return (
          <div key={freq} className="mb-4">
            <div className="flex items-center gap-2 mb-1 px-1">
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${freqBadge}`}>
                {items[0].frequency_name}
              </span>
            </div>
            <div className="space-y-1">
              {items.map((routine) => (
                <div key={routine.id} className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectRoutine?.(routine.id)}
                    className="w-[172px] flex-shrink-0 text-left group"
                  >
                    <span className="text-xs text-slate-300 truncate block group-hover:text-slate-100 transition-colors">
                      {routine.title}
                    </span>
                  </button>
                  <div className="flex gap-0.5">
                    {days.map((date) => {
                      const state = getDotState(routine, date, todayStr, days);
                      let dotClass = "bg-dungeon-900/30"; // future
                      if (state === "done") dotClass = colors.done;
                      else if (state === "satisfied") dotClass = colors.done + " opacity-30";
                      else if (state === "missed") dotClass = colors.missed;

                      return (
                        <div
                          key={date}
                          className={`w-2.5 h-2.5 rounded-sm ${dotClass}`}
                          title={`${routine.title} — ${date}${
                            state === "done" ? " (completed)" :
                            state === "satisfied" ? " (period satisfied)" :
                            state === "missed" ? " (missed)" : ""
                          }`}
                        />
                      );
                    })}
                  </div>
                  {routine.streak_current > 0 && (
                    <span className="text-[10px] text-amber-400 font-mono flex-shrink-0 w-8 text-right">
                      🔥{routine.streak_current}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {routines.length === 0 && (
        <div className="text-center py-12">
          <p className="text-dungeon-500 text-sm">No routines to display</p>
        </div>
      )}
    </div>
  );
}
