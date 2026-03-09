"use client";

import React, { useState, useEffect, useMemo } from "react";

interface Routine {
  id: string;
  title: string;
  frequency: string;
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

export default function RoutineTimeline({ onSelectRoutine, refreshTrigger }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => new Date(), []);

  // Generate 12 weeks of data
  const weeks = useMemo(() => {
    const result: { start: string; end: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i * 7);
      const ws = getWeekStart(d);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      result.push({
        start: toDateStr(ws),
        end: toDateStr(we),
        label: `${ws.toLocaleDateString("en-US", { month: "short" })} ${ws.getDate()}`,
      });
    }
    return result;
  }, [today]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const promises = weeks.map((week) =>
          fetch(`/api/routines/week?date=${week.start}`).then((r) => r.json())
        );
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

        setRoutines(Array.from(routineMap.values()));
      } catch (err) {
        console.error("Failed to fetch:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [weeks, refreshTrigger]);

  // Calculate weekly completion rate per routine
  const getWeekRate = (routine: Routine, weekStart: string, weekEnd: string): number => {
    let completed = 0;
    let expected = 0;

    if (routine.frequency === "daily") {
      expected = 7;
      const cursor = new Date(weekStart + "T12:00:00");
      const end = new Date(weekEnd + "T12:00:00");
      const todayStr = toDateStr(today);
      while (cursor <= end) {
        const ds = toDateStr(cursor);
        if (ds <= todayStr) {
          if (routine.completions[ds]) completed++;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (routine.frequency === "weekly") {
      expected = 1;
      const cursor = new Date(weekStart + "T12:00:00");
      const end = new Date(weekEnd + "T12:00:00");
      while (cursor <= end) {
        if (routine.completions[toDateStr(cursor)]) {
          completed = 1;
          break;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      // Monthly: check if any completion this week
      expected = 1;
      const cursor = new Date(weekStart + "T12:00:00");
      const end = new Date(weekEnd + "T12:00:00");
      while (cursor <= end) {
        if (routine.completions[toDateStr(cursor)]) {
          completed = 1;
          break;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return expected > 0 ? completed / expected : 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-2 border-dungeon-700 border-t-red-500 rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-bold text-slate-100 mb-4 font-mono">12 Week Timeline</h2>

      {/* Week labels */}
      <div className="flex items-center gap-0 mb-1 pl-[160px]">
        {weeks.map((week, i) => (
          <div key={week.start} className="flex-1 min-w-0 text-center">
            {i % 2 === 0 && (
              <span className="text-[8px] text-dungeon-600 truncate block">{week.label}</span>
            )}
          </div>
        ))}
      </div>

      {/* Routine rows */}
      <div className="space-y-1">
        {routines.map((routine) => (
          <div key={routine.id} className="flex items-center gap-2">
            <button
              onClick={() => onSelectRoutine?.(routine.id)}
              className="w-[152px] flex-shrink-0 text-left"
            >
              <span className="text-xs text-slate-300 truncate block">{routine.title}</span>
            </button>
            <div className="flex-1 flex gap-0.5">
              {weeks.map((week) => {
                const rate = getWeekRate(routine, week.start, week.end);
                const intensity = Math.round(rate * 4); // 0-4
                const colors = [
                  "bg-dungeon-800/60",     // 0 - no completions
                  "bg-green-900/40",       // 1 - some
                  "bg-green-700/50",       // 2 - half
                  "bg-green-600/60",       // 3 - most
                  "bg-green-500",          // 4 - all
                ];
                return (
                  <div
                    key={week.start}
                    className={`flex-1 h-5 rounded-sm ${colors[intensity]}`}
                    title={`${routine.title} — ${week.label}: ${Math.round(rate * 100)}%`}
                  />
                );
              })}
            </div>
            {routine.streak_current > 0 && (
              <span className="text-[10px] text-amber-400 font-mono flex-shrink-0 w-8 text-right">
                {routine.streak_current}d
              </span>
            )}
          </div>
        ))}
      </div>

      {routines.length === 0 && (
        <div className="text-center py-12">
          <p className="text-dungeon-500 text-sm">No routines to display</p>
        </div>
      )}
    </div>
  );
}
