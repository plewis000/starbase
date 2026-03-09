"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";

interface Routine {
  id: string;
  title: string;
  frequency: string;
  frequency_name: string;
  recurrence_rule?: string;
  owner_ids?: string[];
  owners?: { id: string; full_name: string; avatar_url?: string | null }[];
  assignee?: { id: string; full_name: string; avatar_url?: string | null };
  streak_current: number;
  streak_longest: number;
  completions: Record<string, boolean>;
  period_satisfied: boolean;
  satisfied_on: string | null;
  period_label: string;
  tags?: any[];
}

interface Props {
  onSelectRoutine?: (id: string) => void;
  selectedRoutineId?: string;
  refreshTrigger?: number;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const FREQ_COLORS: Record<string, string> = {
  daily: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  weekly: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  biweekly: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  monthly: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  quarterly: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  biannual: "text-rose-400 bg-rose-400/10 border-rose-400/20",
  yearly: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
};

const FREQ_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  biannual: "Biannual",
  yearly: "Yearly",
};

const FREQ_ORDER = ["daily", "weekly", "biweekly", "monthly", "quarterly", "biannual", "yearly"];

export default function RoutineChecklist({ onSelectRoutine, selectedRoutineId, refreshTrigger }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const todayStr = useMemo(() => toDateStr(new Date()), []);

  const fetchRoutines = useCallback(async () => {
    try {
      const res = await fetch(`/api/routines/week?date=${todayStr}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRoutines(data.routines || []);
    } catch (err) {
      console.error("Failed to fetch routines:", err);
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    fetchRoutines();
  }, [fetchRoutines, refreshTrigger]);

  const handleCheck = async (routineId: string) => {
    const routine = routines.find((r) => r.id === routineId);
    if (!routine) return;

    const action = routine.period_satisfied ? "uncheck" : "check";
    const date = routine.period_satisfied && routine.satisfied_on ? routine.satisfied_on : todayStr;

    setChecking(routineId);

    // Optimistic update
    setRoutines((prev) =>
      prev.map((r) => {
        if (r.id !== routineId) return r;
        if (action === "check") {
          return {
            ...r,
            period_satisfied: true,
            satisfied_on: todayStr,
            completions: { ...r.completions, [todayStr]: true },
          };
        } else {
          const newCompletions = { ...r.completions };
          delete newCompletions[date];
          return { ...r, period_satisfied: false, satisfied_on: null, completions: newCompletions };
        }
      })
    );

    try {
      const res = await fetch("/api/routines/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: routineId, date, action }),
      });
      if (!res.ok) throw new Error("Check failed");
      // Refetch for updated streaks
      setTimeout(() => fetchRoutines(), 300);
    } catch {
      fetchRoutines();
    } finally {
      setChecking(null);
    }
  };

  // Split routines
  const dueRoutines = routines.filter((r) => !r.period_satisfied);
  const doneRoutines = routines.filter((r) => r.period_satisfied);
  const totalCount = routines.length;
  const doneCount = doneRoutines.length;
  const completionRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Group due routines by frequency
  const groupedDue = useMemo(() => {
    const groups: Record<string, Routine[]> = {};
    for (const r of dueRoutines) {
      const key = r.frequency;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [dueRoutines]);

  const renderRoutineRow = (routine: Routine, isDone: boolean) => (
    <div
      key={routine.id}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all hover:bg-dungeon-800/50 group ${
        isDone
          ? "bg-dungeon-900/50 border-dungeon-800/50"
          : "bg-dungeon-900 border-dungeon-800 hover:border-dungeon-700"
      } ${routine.id === selectedRoutineId ? "border-red-500/50 bg-red-900/10" : ""}`}
    >
      {/* Check button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleCheck(routine.id);
        }}
        disabled={checking === routine.id}
        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          isDone
            ? "border-emerald-400 bg-emerald-400/20 text-emerald-400"
            : "border-dungeon-600 hover:border-green-400/50 text-dungeon-600 hover:text-green-400/50"
        } ${checking === routine.id ? "opacity-50" : ""}`}
      >
        {isDone ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : null}
      </button>

      {/* Title + meta */}
      <div className="flex-1 min-w-0" onClick={() => onSelectRoutine?.(routine.id)}>
        <span
          className={`text-sm font-medium truncate block ${isDone ? "text-dungeon-500 line-through" : "text-slate-100"}`}
        >
          {routine.title}
        </span>
        {isDone && routine.satisfied_on && (
          <span className="text-[10px] text-dungeon-600">
            Done{" "}
            {routine.satisfied_on === todayStr
              ? "today"
              : new Date(routine.satisfied_on + "T12:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
          </span>
        )}
      </div>

      {/* Frequency badge */}
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 ${FREQ_COLORS[routine.frequency] || "text-dungeon-400 bg-dungeon-800 border-dungeon-700"}`}
      >
        {routine.frequency_name || FREQ_LABELS[routine.frequency] || routine.frequency}
      </span>

      {/* Owner avatar */}
      {routine.assignee && (
        <div
          className="w-5 h-5 rounded-full bg-dungeon-700 border border-dungeon-600 flex items-center justify-center flex-shrink-0"
          title={routine.assignee.full_name}
        >
          <span className="text-[8px] font-bold text-dungeon-300">{getInitials(routine.assignee.full_name)}</span>
        </div>
      )}

      {/* Streak badge */}
      {routine.streak_current > 0 && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 flex-shrink-0">
          <span className="text-xs">🔥</span>
          <span className="text-xs font-bold text-amber-400">{routine.streak_current}</span>
        </div>
      )}
    </div>
  );

  if (loading && routines.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-2 border-dungeon-700 border-t-red-500 rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="bg-dungeon-900 rounded-lg p-4 border border-dungeon-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-100">
              {completionRate === 100
                ? "All routines done!"
                : completionRate >= 75
                  ? "Almost there!"
                  : completionRate >= 50
                    ? "Keep going!"
                    : "Today's Routines"}
            </span>
            <span
              className={`text-sm font-bold font-mono ${completionRate === 100 ? "text-emerald-400" : "text-red-400"}`}
            >
              {doneCount}/{totalCount}
            </span>
          </div>
          <div className="w-full bg-dungeon-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${completionRate === 100 ? "bg-emerald-400" : "bg-red-400"}`}
              style={{ width: `${completionRate}%` }}
            />
          </div>
          <p className="text-xs text-dungeon-500 mt-2">
            {dueRoutines.length === 0
              ? "Everything done for now. Great work!"
              : `${dueRoutines.length} routine${dueRoutines.length > 1 ? "s" : ""} remaining`}
          </p>
        </div>
      )}

      {/* Due section */}
      {dueRoutines.length > 0 && (
        <div>
          {FREQ_ORDER.map((freq) => {
            const items = groupedDue[freq];
            if (!items || items.length === 0) return null;
            return (
              <div key={freq} className="mb-4">
                <h2 className="text-xs font-semibold text-dungeon-400 uppercase tracking-wider mb-2 px-1">
                  {FREQ_LABELS[freq] || freq} ({items.length})
                </h2>
                <div className="space-y-1.5">{items.map((r) => renderRoutineRow(r, false))}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Done section (collapsible) */}
      {doneRoutines.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone(!showDone)}
            className="flex items-center gap-2 text-xs font-semibold text-dungeon-500 uppercase tracking-wider mb-3 hover:text-dungeon-400 transition-colors"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform ${showDone ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Done ({doneRoutines.length})
          </button>
          {showDone && <div className="space-y-1.5">{doneRoutines.map((r) => renderRoutineRow(r, true))}</div>}
        </div>
      )}

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <div className="text-4xl mb-3">🔄</div>
          <p className="text-slate-400 text-sm">No routines yet</p>
          <p className="text-dungeon-500 text-xs mt-1">Create a habit or recurring task to see it here</p>
        </div>
      )}
    </div>
  );
}
