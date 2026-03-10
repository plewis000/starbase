"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";

interface Routine {
  id: string;
  title: string;
  description?: string;
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
  due_date?: string;
}

type Scope = "today" | "week" | "month" | "all";

interface Props {
  onSelectRoutine?: (id: string) => void;
  selectedRoutineId?: string;
  refreshTrigger?: number;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekEnd(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? 0 : 7 - day; // Sunday end of week
  date.setDate(date.getDate() + diff);
  return toDateStr(date);
}

function getMonthEnd(d: Date): string {
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function getInitials(name?: string): string {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatOwnerNames(owners?: { id: string; full_name: string }[]): string {
  if (!owners || owners.length === 0) return "";
  if (owners.length === 1) return owners[0].full_name.split(" ")[0];
  return owners.map((o) => o.full_name.split(" ")[0]).join(", ");
}

function formatDueDate(dueDate: string, todayStr: string): { text: string; color: string } {
  if (dueDate === todayStr) return { text: "Due today", color: "text-red-400" };
  if (dueDate < todayStr) {
    const d = new Date(dueDate + "T12:00:00");
    const t = new Date(todayStr + "T12:00:00");
    const diff = Math.round((t.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    return { text: `${diff}d overdue`, color: "text-red-500" };
  }
  const d = new Date(dueDate + "T12:00:00");
  const t = new Date(todayStr + "T12:00:00");
  const diff = Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 1) return { text: "Due tomorrow", color: "text-amber-400" };
  if (diff <= 7) {
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    return { text: `Due ${dayName}`, color: "text-dungeon-400" };
  }
  const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { text: `Due ${formatted}`, color: "text-dungeon-500" };
}

const FREQ_COLORS: Record<string, { badge: string; dot: string }> = {
  daily: { badge: "text-blue-400 bg-blue-400/10 border-blue-400/20", dot: "bg-blue-400" },
  weekly: { badge: "text-purple-400 bg-purple-400/10 border-purple-400/20", dot: "bg-purple-400" },
  biweekly: { badge: "text-violet-400 bg-violet-400/10 border-violet-400/20", dot: "bg-violet-400" },
  monthly: { badge: "text-amber-400 bg-amber-400/10 border-amber-400/20", dot: "bg-amber-400" },
  quarterly: { badge: "text-orange-400 bg-orange-400/10 border-orange-400/20", dot: "bg-orange-400" },
  biannual: { badge: "text-rose-400 bg-rose-400/10 border-rose-400/20", dot: "bg-rose-400" },
  yearly: { badge: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", dot: "bg-emerald-400" },
};

export default function RoutineChecklist({ onSelectRoutine, selectedRoutineId, refreshTrigger }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [scope, setScope] = useState<Scope>("today");

  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const weekEndStr = useMemo(() => getWeekEnd(new Date()), []);
  const monthEndStr = useMemo(() => getMonthEnd(new Date()), []);

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

  // Filter routines by scope using due_date
  const scopedRoutines = useMemo(() => {
    if (scope === "all") return routines;
    return routines.filter((r) => {
      if (!r.due_date) {
        // No due_date: daily routines are always "today", others show in their period
        if (r.frequency === "daily") return true;
        if (scope === "today") return false;
        if (scope === "week") return r.frequency === "weekly" || r.frequency === "biweekly";
        if (scope === "month") return ["weekly", "biweekly", "monthly"].includes(r.frequency);
        return true;
      }
      const due = r.due_date;
      if (scope === "today") return due <= todayStr;
      if (scope === "week") return due <= weekEndStr;
      if (scope === "month") return due <= monthEndStr;
      return true;
    });
  }, [routines, scope, todayStr, weekEndStr, monthEndStr]);

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
      setTimeout(() => fetchRoutines(), 300);
    } catch {
      fetchRoutines();
    } finally {
      setChecking(null);
    }
  };

  // Split scoped routines into due / done, sorted by due_date (soonest first)
  const dueRoutines = useMemo(() =>
    scopedRoutines
      .filter((r) => !r.period_satisfied)
      .sort((a, b) => {
        const aDate = a.due_date || "9999-12-31";
        const bDate = b.due_date || "9999-12-31";
        return aDate.localeCompare(bDate);
      }),
    [scopedRoutines]
  );
  const doneRoutines = scopedRoutines.filter((r) => r.period_satisfied);
  const totalCount = scopedRoutines.length;
  const doneCount = doneRoutines.length;
  const completionRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Mini dots for last 7 days
  const getMiniDots = (routine: Routine) => {
    const dots: { date: string; done: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = toDateStr(d);
      dots.push({ date: ds, done: !!routine.completions[ds] });
    }
    return dots;
  };

  // Scope tab counts
  const scopeCounts = useMemo(() => {
    const count = (s: Scope) => {
      if (s === "all") return routines.filter((r) => !r.period_satisfied).length;
      return routines.filter((r) => {
        if (r.period_satisfied) return false;
        if (!r.due_date) {
          if (r.frequency === "daily") return true;
          if (s === "today") return false;
          if (s === "week") return r.frequency === "weekly" || r.frequency === "biweekly";
          if (s === "month") return ["weekly", "biweekly", "monthly"].includes(r.frequency);
          return true;
        }
        const due = r.due_date;
        if (s === "today") return due <= todayStr;
        if (s === "week") return due <= weekEndStr;
        if (s === "month") return due <= monthEndStr;
        return true;
      }).length;
    };
    return { today: count("today"), week: count("week"), month: count("month"), all: count("all") };
  }, [routines, todayStr, weekEndStr, monthEndStr]);

  const SCOPE_LABELS: { key: Scope; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "all", label: "All" },
  ];

  const renderRoutineRow = (routine: Routine, isDone: boolean) => {
    const ownerNames = formatOwnerNames(routine.owners);
    const dots = getMiniDots(routine);
    const freqColor = FREQ_COLORS[routine.frequency] || FREQ_COLORS.daily;
    const dueInfo = routine.due_date ? formatDueDate(routine.due_date, todayStr) : null;

    return (
      <div
        key={routine.id}
        className={`group rounded-lg border transition-all ${
          isDone
            ? "bg-dungeon-900/40 border-dungeon-800/40"
            : "bg-dungeon-900 border-dungeon-800 hover:border-dungeon-700"
        } ${routine.id === selectedRoutineId ? "border-red-500/50 bg-red-900/10" : ""}`}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          {/* Check button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCheck(routine.id);
            }}
            disabled={checking === routine.id}
            className={`w-7 h-7 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              isDone
                ? "border-emerald-400 bg-emerald-400/20 text-emerald-400"
                : "border-dungeon-600 hover:border-green-400/50 text-dungeon-600 hover:text-green-400/50"
            } ${checking === routine.id ? "opacity-50" : ""}`}
          >
            {isDone ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : null}
          </button>

          {/* Content */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => onSelectRoutine?.(routine.id)}
          >
            {/* Row 1: Title + frequency badge */}
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-sm font-medium truncate ${isDone ? "text-dungeon-500 line-through" : "text-slate-100"}`}>
                {routine.title}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 ${freqColor.badge}`}>
                {routine.frequency_name}
              </span>
            </div>

            {/* Row 2: Due date, owners, tags */}
            <div className="flex items-center gap-2 text-[11px] flex-wrap">
              {/* Due date or completion status */}
              {isDone && routine.satisfied_on ? (
                <span className="text-emerald-500/70">
                  Done {routine.satisfied_on === todayStr
                    ? "today"
                    : new Date(routine.satisfied_on + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                </span>
              ) : dueInfo ? (
                <span className={dueInfo.color}>{dueInfo.text}</span>
              ) : (
                <span className="text-dungeon-500">Due {routine.period_label}</span>
              )}

              {ownerNames && (
                <>
                  <span className="text-dungeon-700">·</span>
                  <span className="text-dungeon-500">{ownerNames}</span>
                </>
              )}

              {routine.tags && routine.tags.length > 0 && routine.tags.some((t: any) => t.tag?.name) && (
                <>
                  <span className="text-dungeon-700">·</span>
                  {routine.tags.slice(0, 2).map((tag: any) => (
                    tag.tag?.name ? (
                      <span
                        key={tag.id || tag.tag_id}
                        className="px-1.5 py-0 rounded text-[10px] bg-dungeon-800 text-dungeon-400 border border-dungeon-700"
                      >
                        {tag.tag.name}
                      </span>
                    ) : null
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3 flex-shrink-0 mt-1">
            {/* Mini 7-day dots */}
            <div className="hidden sm:flex items-center gap-0.5" title="Last 7 days">
              {dots.map((dot) => (
                <div
                  key={dot.date}
                  className={`w-1.5 h-1.5 rounded-full ${
                    dot.done ? freqColor.dot : "bg-dungeon-700/50"
                  }`}
                />
              ))}
            </div>

            {/* Streak */}
            {routine.streak_current > 0 && (
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20">
                <span className="text-[10px]">🔥</span>
                <span className="text-[10px] font-bold text-amber-400 font-mono">{routine.streak_current}</span>
              </div>
            )}

            {/* Owner avatars */}
            {routine.owners && routine.owners.length > 0 && (
              <div className="flex -space-x-1">
                {routine.owners.slice(0, 2).map((owner) => (
                  <div
                    key={owner.id}
                    className="w-5 h-5 rounded-full bg-dungeon-700 border border-dungeon-600 flex items-center justify-center"
                    title={owner.full_name}
                  >
                    <span className="text-[7px] font-bold text-dungeon-300">{getInitials(owner.full_name)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Scope tabs */}
      <div className="flex items-center gap-1 bg-dungeon-900 border border-dungeon-800 rounded-lg p-1">
        {SCOPE_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setScope(key); setShowDone(false); }}
            className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              scope === key
                ? "bg-red-500 text-white shadow-sm"
                : "text-dungeon-400 hover:text-slate-200"
            }`}
          >
            {label}
            {scopeCounts[key] > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                scope === key
                  ? "bg-white/20 text-white"
                  : "bg-dungeon-800 text-dungeon-500"
              }`}>
                {scopeCounts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Progress bar — scoped */}
      {totalCount > 0 && (
        <div className="bg-dungeon-900 rounded-lg p-4 border border-dungeon-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-100">
              {completionRate === 100
                ? `All ${scope === "all" ? "" : scope === "today" ? "today's " : scope === "week" ? "this week's " : "this month's "}routines done!`
                : `${dueRoutines.length} remaining`}
            </span>
            <span className={`text-sm font-bold font-mono ${completionRate === 100 ? "text-emerald-400" : "text-red-400"}`}>
              {doneCount}/{totalCount}
            </span>
          </div>
          <div className="w-full bg-dungeon-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${completionRate === 100 ? "bg-emerald-400" : "bg-red-400"}`}
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Due section — sorted by due date (soonest first) */}
      {dueRoutines.length > 0 && (
        <div className="space-y-1.5">
          {dueRoutines.map((r) => renderRoutineRow(r, false))}
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
      {totalCount === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <p className="text-emerald-400 text-sm font-medium">
            {scope === "today" ? "Nothing due today!" :
             scope === "week" ? "Nothing due this week!" :
             scope === "month" ? "Nothing due this month!" :
             "No routines yet"}
          </p>
          {scope !== "all" && (
            <button
              onClick={() => setScope("all")}
              className="text-xs text-dungeon-500 hover:text-slate-300 mt-2 transition-colors"
            >
              View all routines
            </button>
          )}
        </div>
      )}
    </div>
  );
}
