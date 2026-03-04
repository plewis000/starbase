"use client";

import React from "react";

interface Task {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  completed_at?: string | null;
  recurrence_rule?: string;
  status?: { id: string; name: string; color?: string; icon?: string; sort_order: number };
  priority?: { id: string; name: string; color?: string; icon?: string; sort_order: number };
  assignee?: { id: string; full_name: string; email: string; avatar_url?: string | null };
  tags?: any[];
  checklist_items?: { id: string; title: string; checked: boolean; sort_order: number }[];
  subtask_progress?: { done: number; total: number };
}

interface Props {
  tasks: Task[];
  onQuickComplete: (id: string) => void;
  completedTaskId: string | null;
  config: any;
  onSelect?: (id: string) => void;
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
  if (diff === 1) return "Tomorrow";
  if (diff <= 7) return `In ${diff}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dateColor(d?: string): string {
  if (!d) return "text-slate-600";
  const date = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diff = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "text-red-400";
  if (diff <= 1) return "text-amber-400";
  return "text-slate-500";
}

function priorityColor(name?: string): string {
  switch (name) {
    case "Urgent": return "text-red-400 bg-red-900/20 border-red-800/50";
    case "High": return "text-orange-400 bg-orange-900/20 border-orange-800/50";
    case "Medium": return "text-amber-400 bg-amber-900/20 border-amber-800/50";
    case "Low": return "text-slate-400 bg-slate-800 border-slate-700";
    default: return "text-slate-500 bg-slate-900 border-slate-800";
  }
}

function statusIndicator(name?: string): string {
  switch (name) {
    case "To Do": return "border-slate-500";
    case "In Progress": return "border-blue-400 bg-blue-400/20";
    case "Blocked": return "border-red-500 bg-red-500/20";
    case "Done": return "border-green-500 bg-green-500";
    default: return "border-slate-600";
  }
}

function initials(name?: string): string {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function ListView({ tasks, onQuickComplete, completedTaskId, onSelect }: Props) {
  return (
    <div className="space-y-1">
      {tasks.map((task) => {
        const isCompleted = !!task.completed_at;
        const justCompleted = task.id === completedTaskId;
        const checklist = task.checklist_items || [];
        const checkDone = checklist.filter((c) => c.checked).length;

        return (
          <div
            key={task.id}
            onClick={() => onSelect?.(task.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-slate-900/80 group cursor-pointer ${
              justCompleted ? "bg-green-900/10 ring-1 ring-green-500/20" : ""
            } ${isCompleted ? "opacity-50" : ""}`}
          >
            {/* Check circle */}
            <button
              onClick={(e) => { e.stopPropagation(); onQuickComplete(task.id); }}
              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${
                isCompleted
                  ? "bg-green-500 border-green-500 text-white"
                  : `${statusIndicator(task.status?.name)} hover:border-green-400`
              }`}
            >
              {isCompleted && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>

            {/* Priority pip */}
            {task.priority && (
              <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold border ${priorityColor(task.priority.name)}`}>
                {task.priority.icon || task.priority.name[0]}
              </span>
            )}

            {/* Title + metadata */}
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium truncate ${isCompleted ? "line-through text-slate-500" : "text-slate-100"}`}>
                {task.recurrence_rule && <span className="text-blue-400 mr-1">↻</span>}
                {task.title}
              </div>
              {/* Tags + subtask progress */}
              <div className="flex items-center gap-2 mt-0.5">
                {task.tags?.slice(0, 2).map((tag: any) => tag.tag && (
                  <span key={tag.id} className="text-[10px] text-slate-500" style={{ color: tag.tag.display_color }}>
                    {tag.tag.icon} {tag.tag.name}
                  </span>
                ))}
                {task.subtask_progress && task.subtask_progress.total > 0 && (
                  <span className="text-[10px] text-slate-600">
                    {task.subtask_progress.done}/{task.subtask_progress.total} subtasks
                  </span>
                )}
                {checklist.length > 0 && (
                  <span className="text-[10px] text-slate-600">
                    {checkDone}/{checklist.length} items
                  </span>
                )}
              </div>
            </div>

            {/* Due date */}
            {task.due_date && (
              <span className={`flex-shrink-0 text-xs font-mono ${dateColor(task.due_date)}`}>
                {formatRelDate(task.due_date)}
              </span>
            )}

            {/* Assignee avatar */}
            {task.assignee && (
              <div
                className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[9px] font-bold text-slate-300 border border-slate-700"
                title={task.assignee.full_name}
              >
                {task.assignee.avatar_url ? (
                  <img src={task.assignee.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  initials(task.assignee.full_name)
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
