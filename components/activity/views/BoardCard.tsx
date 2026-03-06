"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";

interface Task {
  id: string;
  title: string;
  due_date?: string;
  completed_at?: string | null;
  status_id?: string;
  priority?: { id: string; name: string; color?: string; sort_order: number };
  assignee?: { id: string; full_name: string; avatar_url?: string | null };
  subtask_progress?: { done: number; total: number };
}

interface BoardCardProps {
  task: Task;
  isDone: boolean;
  isCompleted: boolean;
  isGhost?: boolean;
  isOverlay?: boolean;
  onSelect?: (id: string) => void;
  onQuickComplete: (id: string) => void;
}

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

export default function BoardCard({ task, isDone, isCompleted, isGhost, isOverlay, onSelect, onQuickComplete }: BoardCardProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: task.id,
    data: { task },
    disabled: isOverlay,
  });

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      {...(isOverlay ? {} : listeners)}
      {...(isOverlay ? {} : attributes)}
      onClick={() => !isGhost && onSelect?.(task.id)}
      className={`p-2.5 rounded-lg border transition-all ${
        isOverlay
          ? "bg-slate-900 border-slate-600 cursor-grabbing ring-1 ring-red-400/30"
          : isGhost
            ? "bg-slate-950/30 border-dashed border-slate-700/50 opacity-30"
            : "bg-slate-950/60 border-slate-800/50 hover:border-slate-700 cursor-grab active:cursor-grabbing"
      } ${isCompleted ? "ring-1 ring-green-500/30" : ""}`}
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

      {/* Bottom row */}
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
          {!isDone && (
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onQuickComplete(task.id); }}
              onPointerDown={(e) => e.stopPropagation()}
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
}
