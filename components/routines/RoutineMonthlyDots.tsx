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
        // Fetch 5 weeks of data to cover 30 days
        const promises = [];
        for (let weekOffset = -4; weekOffset <= 0; weekOffset++) {
          const d = new Date(today);
          d.setDate(d.getDate() + weekOffset * 7);
          promises.push(
            fetch(`/api/routines/week?date=${toDateStr(d)}`).then((r) => r.json())
          );
        }
        const results = await Promise.all(promises);

        // Merge routines from all weeks
        const routineMap = new Map<string, Routine>();
        for (const result of results) {
          for (const r of result.routines || []) {
            if (!routineMap.has(r.id)) {
              routineMap.set(r.id, { ...r, completions: {} });
            }
            // Merge completions
            const existing = routineMap.get(r.id)!;
            Object.assign(existing.completions, r.completions);
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
  }, [today, refreshTrigger]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-2 border-dungeon-700 border-t-red-500 rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-bold text-slate-100 mb-4 font-mono">Last 30 Days</h2>

      {/* Day labels (show every 5th) */}
      <div className="flex items-center gap-0 mb-1 pl-[160px]">
        {days.map((date, i) => (
          <div key={date} className="w-3 text-center">
            {i % 5 === 0 ? (
              <span className="text-[8px] text-dungeon-600">{parseInt(date.slice(8))}</span>
            ) : null}
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
            <div className="flex gap-0.5">
              {days.map((date) => {
                const isCompleted = routine.completions[date];
                const isFuture = date > todayStr;
                return (
                  <div
                    key={date}
                    className={`w-2.5 h-2.5 rounded-sm ${
                      isFuture
                        ? "bg-dungeon-900/30"
                        : isCompleted
                        ? "bg-green-500"
                        : "bg-dungeon-800/60"
                    }`}
                    title={`${routine.title} — ${date}${isCompleted ? " (done)" : ""}`}
                  />
                );
              })}
            </div>
            {routine.streak_current > 0 && (
              <span className="text-[10px] text-amber-400 font-mono flex-shrink-0">
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
