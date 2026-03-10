"use client";

import React, { useState, useRef, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import SnoozeMenu, { SNOOZE_OPTIONS, SnoozeCalendar } from "@/components/ui/SnoozeMenu";

interface Task {
  id: string;
  title: string;
  due_date?: string;
  completed_at?: string | null;
  is_habit?: boolean;
  streak_current?: number;
  streak_longest?: number;
  frequency_name?: string;
  recurrence_rule?: string;
  status_id?: string;
  status?: { name: string; color?: string } | null;
  priority?: { id: string; name: string; color?: string; icon?: string; sort_order: number };
  task_type?: { name: string };
  effort_level?: { name: string } | null;
  tags?: { id: string; name: string; display_color?: string }[];
  owner_ids?: string[];
  owners?: { id: string; full_name: string }[];
  snoozed_until?: string | null;
  snooze_count?: number;
  estimated_minutes?: number | null;
  subtask_progress?: { done: number; total: number };
}

interface Props {
  tasks: Task[];
  onQuickComplete: (id: string) => void;
  completedTaskId: string | null;
  onSelect?: (id: string) => void;
  activeTaskId?: string;
  onTaskUpdated?: () => void;
}

/** Format estimated minutes nicely */
function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function TodayView({ tasks, onQuickComplete, completedTaskId, onSelect, activeTaskId, onTaskUpdated }: Props) {
  const toast = useToast();
  const today = new Date().toISOString().split("T")[0];

  // Filter out snoozed tasks
  const activeTasks = tasks.filter((t) => !t.snoozed_until || t.snoozed_until <= today);
  const snoozedTasks = tasks.filter((t) => t.snoozed_until && t.snoozed_until > today);
  const [showSnoozed, setShowSnoozed] = useState(false);

  // Split into habits and regular tasks (visual grouping only — same completion flow)
  const habits = activeTasks.filter((t) => t.is_habit);
  const regularTasks = activeTasks.filter((t) => !t.is_habit);

  // Count completions — unified: everything uses completed_at
  const totalItems = activeTasks.length;
  const totalDone = activeTasks.filter((t) => !!t.completed_at).length;
  const completionRate = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;

  const handleSnooze = async (taskId: string, until: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ until }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to snooze");
        return;
      }
      toast.success("Task snoozed");
      onTaskUpdated?.();
    } catch {
      toast.error("Failed to snooze");
    }
  };

  const handleUnsnooze = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/snooze`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to unsnooze");
        return;
      }
      toast.success("Snooze cleared");
      onTaskUpdated?.();
    } catch {
      toast.error("Failed to unsnooze");
    }
  };

  /** Render metadata pills for a task */
  const renderMeta = (task: Task, isHabit: boolean) => {
    const pills: React.ReactNode[] = [];

    // Type
    if (task.task_type) {
      pills.push(
        <span key="type" className="text-[10px] text-dungeon-500">{task.task_type.name}</span>
      );
    }

    // Effort
    if (task.effort_level) {
      pills.push(
        <span key="effort" className="text-[10px] text-dungeon-500">{task.effort_level.name}</span>
      );
    }

    // Estimated time
    if (task.estimated_minutes) {
      pills.push(
        <span key="est" className="text-[10px] text-dungeon-500">{formatMinutes(task.estimated_minutes)}</span>
      );
    }

    // Frequency for habits
    if (isHabit && task.frequency_name) {
      pills.push(
        <span key="freq" className="text-[10px] text-dungeon-500">{task.frequency_name}</span>
      );
    }

    // Subtask progress
    if (task.subtask_progress && task.subtask_progress.total > 0) {
      pills.push(
        <span key="sub" className="text-[10px] text-dungeon-500">
          {task.subtask_progress.done}/{task.subtask_progress.total} subtasks
        </span>
      );
    }

    // Snooze count
    if (task.snooze_count && task.snooze_count > 0) {
      pills.push(
        <span key="snz" className="text-[10px] text-amber-500">snoozed {task.snooze_count}x</span>
      );
    }

    if (pills.length === 0) return null;
    return (
      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
        {pills.map((pill, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-dungeon-700 text-[8px]">·</span>}
            {pill}
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Progress bar */}
      {totalItems > 0 && (
        <div className="bg-dungeon-900 rounded-lg p-4 border border-dungeon-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-100">
              {completionRate === 100
                ? "All done today!"
                : completionRate >= 75
                ? "Almost there!"
                : completionRate >= 50
                ? "Keep it up!"
                : "Today's Progress"}
            </span>
            <span
              className={`text-sm font-bold ${
                completionRate === 100 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {totalDone}/{totalItems}
              {snoozedTasks.length > 0 && (
                <span className="text-dungeon-500 font-normal ml-2 text-xs">
                  +{snoozedTasks.length} snoozed
                </span>
              )}
            </span>
          </div>
          <div className="w-full bg-dungeon-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                completionRate === 100 ? "bg-emerald-400" : "bg-red-400"
              }`}
              style={{ width: `${completionRate}%` }}
            />
          </div>
          <p className="text-xs text-dungeon-500 mt-2">
            {totalDone === 0
              ? "Start your day — check off your first item"
              : completionRate === 100
              ? "You're on fire! Everything done."
              : `${totalItems - totalDone} item${totalItems - totalDone > 1 ? "s" : ""} remaining`}
          </p>
        </div>
      )}

      {/* Habits section */}
      {habits.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-dungeon-400 uppercase tracking-wider mb-3">
            Habits ({habits.filter(h => !!h.completed_at).length}/{habits.length})
          </h2>
          <div className="space-y-1.5">
            {habits.map((task) => {
              const isDone = !!task.completed_at;
              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all hover:bg-dungeon-800/50 group ${
                    isDone
                      ? "bg-dungeon-900/50 border-dungeon-800/50"
                      : "bg-dungeon-900 border-dungeon-800 hover:border-dungeon-700"
                  } ${task.id === activeTaskId ? "border-red-500/50 bg-red-900/10" : ""}`}
                >
                  {/* Complete button — same as tasks */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickComplete(task.id);
                    }}
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isDone
                        ? "border-emerald-400 bg-emerald-400/20 text-emerald-400"
                        : "border-dungeon-600 hover:border-red-400/50 text-dungeon-600 hover:text-red-400/50"
                    }`}
                  >
                    {isDone ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                  </button>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0" onClick={() => onSelect?.(task.id)}>
                    <span className={`text-sm font-medium truncate block ${isDone ? "text-dungeon-500 line-through" : "text-slate-100"}`}>
                      {task.title}
                    </span>
                    {renderMeta(task, true)}
                  </div>

                  {/* Tags */}
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex gap-1 flex-shrink-0">
                      {task.tags.filter(t => t.name !== "Recurring").slice(0, 2).map((tag) => (
                        <span key={tag.id} className="px-1.5 py-0.5 rounded text-[10px] font-medium text-dungeon-400 bg-dungeon-800 border border-dungeon-700">
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Streak badge */}
                  {(task.streak_current || 0) > 0 && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 flex-shrink-0">
                      <span className="text-xs">🔥</span>
                      <span className="text-xs font-bold text-amber-400">{task.streak_current}</span>
                    </div>
                  )}

                  {/* Snooze */}
                  {!isDone && <SnoozeMenu taskId={task.id} onSnooze={handleSnooze} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tasks section */}
      {regularTasks.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-dungeon-400 uppercase tracking-wider mb-3">
            Tasks ({regularTasks.filter(t => !!t.completed_at).length}/{regularTasks.length})
          </h2>
          <div className="space-y-1.5">
            {regularTasks.map((task) => {
              const isDone = !!task.completed_at;
              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all hover:bg-dungeon-800/50 group ${
                    isDone
                      ? "bg-dungeon-900/50 border-dungeon-800/50"
                      : "bg-dungeon-900 border-dungeon-800 hover:border-dungeon-700"
                  } ${task.id === activeTaskId ? "border-red-500/50 bg-red-900/10" : ""}`}
                >
                  {/* Complete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickComplete(task.id);
                    }}
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isDone
                        ? "border-emerald-400 bg-emerald-400/20 text-emerald-400"
                        : "border-dungeon-600 hover:border-red-400/50 text-dungeon-600 hover:text-red-400/50"
                    }`}
                  >
                    {isDone ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                  </button>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0" onClick={() => onSelect?.(task.id)}>
                    <span className={`text-sm font-medium truncate block ${isDone ? "text-dungeon-500 line-through" : "text-slate-100"}`}>
                      {task.title}
                    </span>
                    {renderMeta(task, false)}
                  </div>

                  {/* Owners (if multiple) */}
                  {task.owners && task.owners.length > 1 && (
                    <div className="flex -space-x-1.5 flex-shrink-0">
                      {task.owners.slice(0, 3).map((o) => (
                        <div key={o.id} className="w-5 h-5 rounded-full bg-dungeon-700 border border-dungeon-900 flex items-center justify-center" title={o.full_name}>
                          <span className="text-[8px] font-bold text-dungeon-400">{o.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Priority pill */}
                  {task.priority && task.priority.name !== "None" && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                      style={{
                        color: task.priority.color || "#94a3b8",
                        backgroundColor: `${task.priority.color || "#94a3b8"}15`,
                        borderColor: `${task.priority.color || "#94a3b8"}30`,
                        borderWidth: 1,
                      }}
                    >
                      {task.priority.icon || ""} {task.priority.name}
                    </span>
                  )}

                  {/* Tags */}
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex gap-1 flex-shrink-0">
                      {task.tags.filter(t => t.name !== "Recurring").slice(0, 2).map((tag) => (
                        <span key={tag.id} className="px-1.5 py-0.5 rounded text-[10px] font-medium text-dungeon-400 bg-dungeon-800 border border-dungeon-700">
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Snooze */}
                  {!isDone && <SnoozeMenu taskId={task.id} onSnooze={handleSnooze} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Snoozed section */}
      {snoozedTasks.length > 0 && (
        <div>
          <button
            onClick={() => setShowSnoozed(!showSnoozed)}
            className="flex items-center gap-2 text-xs font-semibold text-dungeon-500 uppercase tracking-wider mb-3 hover:text-dungeon-400 transition-colors"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${showSnoozed ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Snoozed ({snoozedTasks.length})
          </button>
          {showSnoozed && (
            <div className="space-y-1.5">
              {snoozedTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-dungeon-800/50 bg-dungeon-900/30 opacity-60 hover:opacity-80 transition-all cursor-pointer group"
                  onClick={() => onSelect?.(task.id)}
                >
                  <span className="text-sm flex-shrink-0">💤</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-dungeon-400 truncate block">{task.title}</span>
                    <span className="text-xs text-dungeon-600">
                      Until {new Date(task.snoozed_until + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {task.snooze_count && task.snooze_count > 1 && (
                        <span className="ml-1.5 text-amber-600">· snoozed {task.snooze_count}x</span>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleUnsnooze(task.id); }}
                    className="text-xs text-dungeon-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 px-2 py-1 border border-transparent hover:border-red-400/20 rounded"
                  >
                    Wake up
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {totalItems === 0 && snoozedTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <div className="text-4xl mb-3">✨</div>
          <p className="text-slate-400 text-sm">Nothing due today</p>
          <p className="text-slate-600 text-xs mt-1">Enjoy the free time, or add tasks from the list view</p>
        </div>
      )}

      {totalItems === 0 && snoozedTasks.length > 0 && (
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <p className="text-slate-400 text-sm">All tasks snoozed</p>
          <p className="text-slate-600 text-xs mt-1">{snoozedTasks.length} task{snoozedTasks.length > 1 ? "s" : ""} waiting to come back</p>
        </div>
      )}
    </div>
  );
}
