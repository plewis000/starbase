"use client";

import React, { useMemo } from "react";

interface Task {
  id: string;
  title: string;
  due_date?: string;
  completed_at?: string | null;
  status?: { id: string; name: string; color?: string; sort_order: number };
  priority?: { id: string; name: string; color?: string; sort_order: number };
  assignee?: { id: string; full_name: string; avatar_url?: string | null };
}

interface Props {
  tasks: Task[];
  onQuickComplete: (id: string) => void;
  completedTaskId: string | null;
}

function priorityBarColor(name?: string): string {
  switch (name) {
    case "Urgent": return "bg-red-500";
    case "High": return "bg-orange-500";
    case "Medium": return "bg-amber-500";
    case "Low": return "bg-slate-500";
    default: return "bg-slate-600";
  }
}

function statusBarOpacity(name?: string): string {
  if (name === "Done") return "opacity-40";
  if (name === "Blocked") return "opacity-70";
  return "";
}

export default function TimelineView({ tasks, onQuickComplete, completedTaskId }: Props) {
  // Group tasks by date buckets
  const groups = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const buckets: { label: string; key: string; tasks: Task[] }[] = [
      { label: "Overdue", key: "overdue", tasks: [] },
      { label: "Today", key: "today", tasks: [] },
      { label: "Tomorrow", key: "tomorrow", tasks: [] },
    ];

    // Create next 12 day buckets
    for (let i = 2; i <= 13; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      buckets.push({ label, key: `day_${i}`, tasks: [] });
    }
    buckets.push({ label: "Later", key: "later", tasks: [] });
    buckets.push({ label: "No Date", key: "nodate", tasks: [] });

    for (const task of tasks) {
      if (!task.due_date) {
        buckets[buckets.length - 1].tasks.push(task);
        continue;
      }

      const taskDate = new Date(task.due_date);
      taskDate.setHours(0, 0, 0, 0);
      const diff = Math.ceil((taskDate.getTime() - todayMs) / 86400000);

      if (diff < 0) {
        buckets[0].tasks.push(task); // Overdue
      } else if (diff === 0) {
        buckets[1].tasks.push(task); // Today
      } else if (diff === 1) {
        buckets[2].tasks.push(task); // Tomorrow
      } else if (diff <= 13) {
        buckets[diff + 1].tasks.push(task); // Day buckets (index 3 = day 2, etc.)
      } else {
        buckets[buckets.length - 2].tasks.push(task); // Later
      }
    }

    // Only return non-empty buckets
    return buckets.filter((b) => b.tasks.length > 0);
  }, [tasks]);

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-600 text-sm">
        No tasks to display on timeline
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <div key={group.key}>
          {/* Date header */}
          <div className="sticky top-0 z-10 flex items-center gap-3 py-1.5 bg-slate-950/95 backdrop-blur-sm">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              group.key === "overdue" ? "bg-red-500" :
              group.key === "today" ? "bg-amber-400" :
              group.key === "tomorrow" ? "bg-blue-400" :
              "bg-slate-700"
            }`} />
            <span className={`text-xs font-bold uppercase tracking-wider ${
              group.key === "overdue" ? "text-red-400" :
              group.key === "today" ? "text-amber-300" :
              "text-slate-500"
            }`}>
              {group.label}
            </span>
            <span className="text-[10px] text-slate-700 font-mono">{group.tasks.length}</span>
            <div className="flex-1 border-b border-slate-800/50" />
          </div>

          {/* Gantt-style bars */}
          <div className="pl-5 space-y-0.5">
            {group.tasks.map((task) => {
              const isCompleted = !!task.completed_at;
              const justCompleted = task.id === completedTaskId;

              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-2 py-1 group ${statusBarOpacity(task.status?.name)}`}
                >
                  {/* Complete button */}
                  <button
                    onClick={() => onQuickComplete(task.id)}
                    className={`flex-shrink-0 w-4 h-4 rounded-full border transition-all flex items-center justify-center ${
                      isCompleted
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-slate-700 hover:border-green-400 group-hover:border-slate-500"
                    }`}
                  >
                    {isCompleted && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>

                  {/* Priority bar + title */}
                  <div className={`flex-1 flex items-center gap-2 px-2.5 py-1 rounded ${
                    justCompleted ? "ring-1 ring-green-500/30" : ""
                  }`}>
                    <div className={`w-1 h-4 rounded-full flex-shrink-0 ${priorityBarColor(task.priority?.name)}`} />
                    <span className={`text-xs truncate flex-1 ${
                      isCompleted ? "line-through text-slate-600" : "text-slate-200"
                    }`}>
                      {task.title}
                    </span>

                    {/* Status badge */}
                    {task.status && task.status.name !== "Done" && (
                      <span className="text-[9px] text-slate-600 font-mono flex-shrink-0">
                        {task.status.name}
                      </span>
                    )}

                    {/* Assignee */}
                    {task.assignee && (
                      <div
                        className="flex-shrink-0 w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[7px] font-bold text-slate-500 border border-slate-700"
                        title={task.assignee.full_name}
                      >
                        {task.assignee.full_name?.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
