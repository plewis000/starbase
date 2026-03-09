"use client";

import React from "react";

interface Task {
  id: string;
  title: string;
  due_date?: string;
  start_date?: string;
  schedule_date?: string;
  completed_at?: string | null;
  owners?: { id: string; full_name: string; avatar_url?: string | null }[];
  status?: { name: string };
  priority?: { name: string };
  assignee?: { full_name: string; avatar_url?: string | null };
}

interface GanttBarProps {
  task: Task;
  startDay: number;
  duration: number;
  dayWidth: number;
  rowHeight: number;
  rowIndex: number;
  onSelect?: (id: string) => void;
}

function priorityColor(name?: string): string {
  switch (name) {
    case "Urgent": return "bg-red-500/80";
    case "High": return "bg-orange-500/70";
    case "Medium": return "bg-amber-500/60";
    case "Low": return "bg-dungeon-600";
    default: return "bg-dungeon-600";
  }
}

function statusBorder(name?: string): string {
  switch (name) {
    case "Done": return "border-green-500/50";
    case "In Progress": return "border-blue-500/50";
    case "Blocked": return "border-red-500/50";
    default: return "border-dungeon-700/50";
  }
}

export default function GanttBar({ task, startDay, duration, dayWidth, rowHeight, rowIndex, onSelect }: GanttBarProps) {
  const left = startDay * dayWidth;
  const width = Math.max(duration * dayWidth, dayWidth); // at least 1 day wide
  const top = rowIndex * rowHeight;
  const isDone = !!task.completed_at;

  return (
    <div
      className={`absolute flex items-center rounded border cursor-pointer transition-all hover:brightness-125 ${
        priorityColor(task.priority?.name)
      } ${statusBorder(task.status?.name)} ${isDone ? "opacity-50" : ""}`}
      style={{
        left: `${left}px`,
        top: `${top + 4}px`,
        width: `${width}px`,
        height: `${rowHeight - 8}px`,
      }}
      onClick={() => onSelect?.(task.id)}
      title={`${task.title}${task.due_date ? ` (due: ${task.due_date})` : ""}`}
    >
      <span className={`px-2 text-[10px] font-medium truncate ${isDone ? "line-through text-slate-400" : "text-white"}`}>
        {task.title}
      </span>

      {/* Owner initials on right edge */}
      {(() => {
        const ppl = task.owners && task.owners.length > 0 ? task.owners : task.assignee ? [task.assignee] : [];
        return ppl.length > 0 ? (
          <div className="absolute -right-1 -top-1 flex -space-x-1">
            {ppl.slice(0, 2).map((o, i) => (
              <div key={i} className="w-4 h-4 rounded-full bg-dungeon-900 border border-dungeon-700 flex items-center justify-center text-[7px] font-bold text-slate-300">
                {o.full_name?.charAt(0) || "?"}
              </div>
            ))}
          </div>
        ) : null;
      })()}
    </div>
  );
}
