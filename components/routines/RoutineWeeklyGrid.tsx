"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";

interface Routine {
  id: string;
  title: string;
  frequency: "daily" | "weekly" | "monthly";
  frequency_name: string;
  recurrence_rule?: string;
  owner_ids?: string[];
  owners?: { id: string; full_name: string; avatar_url?: string | null }[];
  assignee?: { id: string; full_name: string; avatar_url?: string | null };
  streak_current: number;
  streak_longest: number;
  completions: Record<string, boolean>;
  satisfied: Record<string, boolean>;
  period_satisfied: boolean;
  satisfied_on: string | null;
  tags?: any[];
}

interface Props {
  onSelectRoutine?: (id: string) => void;
  selectedRoutineId?: string;
  refreshTrigger?: number;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

function getInitials(name?: string): string {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function RoutineWeeklyGrid({ onSelectRoutine, selectedRoutineId, refreshTrigger }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [checking, setChecking] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayStr = toDateStr(today);

  const weekStart = useMemo(() => {
    const ws = getWeekStart(today);
    ws.setDate(ws.getDate() + weekOffset * 7);
    return ws;
  }, [today, weekOffset]);

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return toDateStr(d);
    });
  }, [weekStart]);

  const fetchRoutines = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/routines/week?date=${toDateStr(weekStart)}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRoutines(data.routines || []);
    } catch (err) {
      console.error("Failed to fetch routines:", err);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    fetchRoutines();
  }, [fetchRoutines, refreshTrigger]);

  const handleCheck = async (routineId: string, date: string) => {
    const routine = routines.find((r) => r.id === routineId);
    if (!routine) return;

    // Don't allow checking future dates
    if (date > todayStr) return;

    const isCompleted = routine.completions[date];
    const action = isCompleted ? "uncheck" : "check";

    // Don't check if already satisfied (weekly/monthly) and not the completion day
    if (!isCompleted && routine.satisfied[date]) return;

    setChecking(`${routineId}-${date}`);

    // Optimistic update
    setRoutines((prev) =>
      prev.map((r) => {
        if (r.id !== routineId) return r;
        const newCompletions = { ...r.completions };
        if (action === "check") {
          newCompletions[date] = true;
        } else {
          delete newCompletions[date];
        }
        return { ...r, completions: newCompletions };
      })
    );

    try {
      const res = await fetch("/api/routines/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: routineId, date, action }),
      });
      if (!res.ok) throw new Error("Check failed");
      // Refetch to get updated satisfaction/streaks
      await fetchRoutines();
    } catch {
      // Revert on error
      await fetchRoutines();
    } finally {
      setChecking(null);
    }
  };

  const weekLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const startMonth = weekStart.toLocaleDateString("en-US", { month: "short" });
    const endMonth = end.toLocaleDateString("en-US", { month: "short" });
    const startDay = weekStart.getDate();
    const endDay = end.getDate();
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  }, [weekStart]);

  // Group routines by frequency
  const grouped = useMemo(() => {
    const groups: Record<string, Routine[]> = { daily: [], weekly: [], monthly: [] };
    for (const r of routines) {
      groups[r.frequency]?.push(r);
    }
    return groups;
  }, [routines]);

  const getCellState = (routine: Routine, date: string): "done" | "satisfied" | "pending" | "missed" | "future" => {
    if (date > todayStr) return "future";
    if (routine.completions[date]) return "done";
    if (routine.satisfied[date]) return "satisfied";
    if (date < todayStr) {
      // For daily: past uncompleted = missed
      if (routine.frequency === "daily") return "missed";
      // For weekly/monthly: only missed if period is over and unsatisfied
      if (!routine.period_satisfied) return "missed";
      return "satisfied";
    }
    return "pending";
  };

  const renderCell = (routine: Routine, date: string) => {
    const state = getCellState(routine, date);
    const isChecking = checking === `${routine.id}-${date}`;

    const baseClasses = "w-8 h-8 sm:w-9 sm:h-9 rounded-md flex items-center justify-center transition-all text-sm";

    switch (state) {
      case "done":
        return (
          <button
            onClick={() => handleCheck(routine.id, date)}
            disabled={isChecking}
            className={`${baseClasses} bg-green-600/30 border border-green-600/50 text-green-400 hover:bg-green-600/40`}
            title={`Completed on ${date}`}
          >
            ✓
          </button>
        );
      case "satisfied":
        return (
          <div
            className={`${baseClasses} bg-dungeon-800/50 border border-dungeon-700/50 text-dungeon-600`}
            title={`Satisfied for this ${routine.frequency === "weekly" ? "week" : "month"}`}
          >
            –
          </div>
        );
      case "pending":
        return (
          <button
            onClick={() => handleCheck(routine.id, date)}
            disabled={isChecking}
            className={`${baseClasses} bg-dungeon-900 border border-dungeon-700 text-dungeon-600 hover:border-green-600/50 hover:text-green-400`}
            title="Click to complete"
          >
            ○
          </button>
        );
      case "missed":
        return (
          <button
            onClick={() => handleCheck(routine.id, date)}
            disabled={isChecking}
            className={`${baseClasses} bg-red-950/20 border border-red-900/30 text-red-800 hover:border-red-600/50 hover:text-red-400`}
            title="Missed - click to retroactively complete"
          >
            ○
          </button>
        );
      case "future":
        return (
          <div className={`${baseClasses} bg-dungeon-950/50 border border-dungeon-800/30 text-dungeon-700`}>
            ·
          </div>
        );
    }
  };

  const renderGroup = (frequency: string, items: Routine[]) => {
    if (items.length === 0) return null;
    const label = frequency.charAt(0).toUpperCase() + frequency.slice(1);

    return (
      <div key={frequency} className="mb-6">
        <h3 className="text-xs font-semibold text-dungeon-500 uppercase tracking-wider mb-2 px-1">
          {label}
        </h3>
        <div className="space-y-1">
          {items.map((routine) => (
            <div
              key={routine.id}
              className={`flex items-center gap-2 sm:gap-3 py-1.5 px-2 rounded-lg transition-colors ${
                selectedRoutineId === routine.id
                  ? "bg-crimson-900/20 border border-crimson-800/30"
                  : "hover:bg-dungeon-900/50"
              }`}
            >
              {/* Routine info */}
              <button
                onClick={() => onSelectRoutine?.(routine.id)}
                className="flex items-center gap-2 min-w-0 flex-shrink-0 w-[140px] sm:w-[180px] text-left"
              >
                {routine.assignee && (
                  <span className="w-5 h-5 rounded-full bg-dungeon-700 flex items-center justify-center text-[8px] font-semibold text-dungeon-300 flex-shrink-0">
                    {getInitials(routine.assignee.full_name)}
                  </span>
                )}
                <span className="text-sm text-slate-200 truncate">{routine.title}</span>
              </button>

              {/* Streak badge */}
              {routine.streak_current > 0 && (
                <span className="text-[10px] text-amber-400 font-mono flex-shrink-0 w-8 text-right">
                  {routine.streak_current}d
                </span>
              )}

              {/* Week cells */}
              <div className="flex gap-1">
                {weekDates.map((date) => (
                  <div key={date}>
                    {renderCell(routine, date)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading && routines.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-2 border-dungeon-700 border-t-red-500 rounded-full" />
      </div>
    );
  }

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="px-2 py-1 rounded text-sm text-dungeon-400 hover:text-slate-100 hover:bg-dungeon-800 transition-colors"
          >
            &lt;
          </button>
          <h2 className="text-sm font-bold text-slate-100 min-w-[140px] text-center font-mono">
            {weekLabel}
          </h2>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            disabled={weekOffset >= 0}
            className="px-2 py-1 rounded text-sm text-dungeon-400 hover:text-slate-100 hover:bg-dungeon-800 transition-colors disabled:opacity-30"
          >
            &gt;
          </button>
        </div>
        {weekOffset !== 0 && (
          <button
            onClick={() => setWeekOffset(0)}
            className="text-xs text-dungeon-400 border border-dungeon-700 rounded-lg px-3 py-1 hover:bg-dungeon-800 transition-colors"
          >
            This Week
          </button>
        )}
      </div>

      {/* Day headers */}
      <div className="flex items-center gap-2 sm:gap-3 mb-2 pl-[140px] sm:pl-[180px]">
        <div className="w-8 flex-shrink-0" /> {/* streak spacer */}
        <div className="flex gap-1">
          {weekDates.map((date, i) => {
            const isToday = date === todayStr;
            return (
              <div
                key={date}
                className={`w-8 sm:w-9 text-center text-[10px] font-semibold uppercase ${
                  isToday ? "text-red-400" : "text-dungeon-500"
                }`}
              >
                {DAYS[i]}
              </div>
            );
          })}
        </div>
      </div>

      {/* Routine groups */}
      {renderGroup("daily", grouped.daily)}
      {renderGroup("weekly", grouped.weekly)}
      {renderGroup("monthly", grouped.monthly)}

      {routines.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🔄</p>
          <p className="text-slate-400 text-sm">No routines yet</p>
          <p className="text-dungeon-500 text-xs mt-1">Create a habit or recurring task to see it here</p>
        </div>
      )}
    </div>
  );
}
