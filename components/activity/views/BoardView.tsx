"use client";

import React from "react";

interface Task {
  id: string;
  title: string;
  due_date?: string;
  completed_at?: string | null;
  status?: { id: string; name: string; color?: string; sort_order: number };
  priority?: { id: string; name: string; color?: string; sort_order: number };
  assignee?: { id: string; full_name: string; avatar_url?: string | null };
  subtask_progress?: { done: number; total: number };
}

interface Props {
  tasks: Task[];
  onQuickComplete: (id: string) => void;
  completedTaskId: string | null;
  config: any;
}

// Kanban columns — map status names to columns
const COLUMNS = [
  { name: "To Do", color: "border-slate-600", bg: "bg-slate-900/30" },
  { name: "In Progress", color: "border-blue-500", bg: "bg-blue-950/20" },
  { name: "Blocked", color: "border-red-500", bg: "bg-red-950/20" },
  { name: "Done", color: "border-green-500", bg: "bg-green-950/20" },
];

function priorityDot(name?: string): string {
  switch (name) {
    case "Urgent": return "bg-red-400";
    case "High": return "bg-orange-400";
    case "Medium": return "bg-amber-400";
    case "Low": return "bg-slate-500";
    default: return "bg-slate-700";
  }
}

function formatRelDate(d?: string): string {
  if (!d) return "";
  const date = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diff = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tmrw";
  if (diff <= 7) return `${diff}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dateColor(d?: string): string {
  if (!d) return "";
  const date = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diff = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "text-red-400";
  if (diff <= 1) return "text-amber-400";
  return "text-slate-500";
}

export default function BoardView({ tasks, onQuickComplete, completedTaskId }: Props) {
  // Group tasks by status
  const grouped: Record<string, Task[]> = {};
  for (const col of COLUMNS) {
    grouped[col.name] = [];
  }
  grouped["Other"] = [];

  for (const task of tasks) {
    const statusName = task.status?.name || "Other";
    if (grouped[statusName]) {
      grouped[statusName].push(task);
    } else {
      grouped["Other"].push(task);
    }
  }

  // Merge Other into To Do
  if (grouped["Other"].length > 0) {
    grouped["To Do"] = [...grouped["Other"], ...grouped["To Do"]];
  }

  return (
    <div className="flex gap-3 overflow-x-auto h-full pb-2">
      {COLUMNS.map((col) => {
        const colTasks = grouped[col.name] || [];
        return (
          <div key={col.name} className={`flex-shrink-0 w-64 flex flex-col rounded-xl border ${col.color} ${col.bg}`}>
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/50">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${col.color.replace("border-", "bg-")}`} />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{col.name}</span>
              </div>
              <span className="text-[10px] text-slate-600 font-mono">{colTasks.length}</span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {colTasks.map((task) => {
                const justCompleted = task.id === completedTaskId;
                return (
                  <div
                    key={task.id}
                    className={`p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/50 hover:border-slate-700 transition-all cursor-default ${
                      justCompleted ? "ring-1 ring-green-500/30" : ""
                    }`}
                  >
                    {/* Title row with priority dot */}
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${priorityDot(task.priority?.name)}`} />
                      <p className={`text-xs font-medium leading-snug flex-1 ${
                        task.completed_at ? "line-through text-slate-500" : "text-slate-200"
                      }`}>
                        {task.title}
                      </p>
                    </div>

                    {/* Bottom row: due date + assignee + complete button */}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        {task.due_date && (
                          <span className={`text-[10px] font-mono ${dateColor(task.due_date)}`}>
                            {formatRelDate(task.due_date)}
                          </span>
                        )}
                        {task.subtask_progress && task.subtask_progress.total > 0 && (
                          <span className="text-[10px] text-slate-600">
                            {task.subtask_progress.done}/{task.subtask_progress.total}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {task.assignee && (
                          <div
                            className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-bold text-slate-400 border border-slate-700"
                            title={task.assignee.full_name}
                          >
                            {task.assignee.avatar_url ? (
                              <img src={task.assignee.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              task.assignee.full_name?.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
                            )}
                          </div>
                        )}
                        {col.name !== "Done" && (
                          <button
                            onClick={() => onQuickComplete(task.id)}
                            className="w-5 h-5 rounded-full border border-slate-700 hover:border-green-500 hover:bg-green-500/10 transition-all flex items-center justify-center"
                            title="Mark complete"
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-600 hover:text-green-400">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {colTasks.length === 0 && (
                <p className="text-[10px] text-slate-700 text-center py-4">Empty</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
