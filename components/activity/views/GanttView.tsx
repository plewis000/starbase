"use client";

import React, { useState, useMemo, useRef } from "react";
import GanttBar from "./GanttBar";
import GanttDependencyLines from "./GanttDependencyLines";
import { todayInTimezone } from "@/lib/dateUtils";

interface Task {
  id: string;
  title: string;
  due_date?: string;
  schedule_date?: string;
  created_at?: string;
  completed_at?: string | null;
  status?: { id: string; name: string };
  priority?: { id: string; name: string; sort_order: number };
  assignee?: { id: string; full_name: string; avatar_url?: string | null };
  dependencies?: { id: string; blocking_task_id: string; depends_on_task_id: string }[];
}

interface Props {
  tasks: Task[];
  onSelect?: (id: string) => void;
  timezone?: string;
}

type ZoomLevel = "day" | "week" | "month";

const ZOOM_CONFIG: Record<ZoomLevel, { dayWidth: number; headerFormat: (d: Date) => string }> = {
  day: {
    dayWidth: 40,
    headerFormat: (d: Date) => `${d.getDate()}`,
  },
  week: {
    dayWidth: 20,
    headerFormat: (d: Date) => {
      if (d.getDay() === 1) return `W${getWeekNumber(d)}`;
      return "";
    },
  },
  month: {
    dayWidth: 8,
    headerFormat: (d: Date) => {
      if (d.getDate() === 1) return d.toLocaleDateString("en-US", { month: "short" });
      return "";
    },
  },
};

function getWeekNumber(d: Date): number {
  const oneJan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

const ROW_HEIGHT = 36;
const LABEL_WIDTH = 200;

export default function GanttView({ tasks, onSelect, timezone }: Props) {
  const [zoom, setZoom] = useState<ZoomLevel>("day");
  const scrollRef = useRef<HTMLDivElement>(null);
  const config = ZOOM_CONFIG[zoom];

  // Calculate date range
  const { startDate, endDate, totalDays, sortedTasks } = useMemo(() => {
    const now = timezone ? todayInTimezone(timezone) : new Date();
    if (!timezone) now.setHours(0, 0, 0, 0);

    let minDate = new Date(now);
    let maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + 30); // minimum 30 days view

    for (const task of tasks) {
      const schedDate = task.schedule_date || task.created_at;
      const dueDate = task.due_date;
      if (schedDate) {
        const d = new Date(schedDate);
        if (d < minDate) minDate = new Date(d);
      }
      if (dueDate) {
        const d = new Date(dueDate);
        if (d > maxDate) maxDate = new Date(d);
      }
    }

    // Add padding
    minDate.setDate(minDate.getDate() - 2);
    maxDate.setDate(maxDate.getDate() + 7);

    const totalDays = daysBetween(minDate, maxDate) + 1;

    // Sort tasks by due_date
    const sorted = [...tasks].sort((a, b) => {
      const aDate = a.due_date || a.schedule_date || "9999";
      const bDate = b.due_date || b.schedule_date || "9999";
      return aDate.localeCompare(bDate);
    });

    return { startDate: minDate, endDate: maxDate, totalDays, sortedTasks: sorted };
  }, [tasks, timezone]);

  // Generate day columns for header
  const dayColumns = useMemo(() => {
    const cols: { date: Date; label: string; isToday: boolean; isWeekend: boolean }[] = [];
    const today = timezone ? todayInTimezone(timezone) : new Date();
    if (!timezone) today.setHours(0, 0, 0, 0);

    for (let i = 0; i < totalDays; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      cols.push({
        date,
        label: config.headerFormat(date),
        isToday: date.getTime() === today.getTime(),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      });
    }
    return cols;
  }, [startDate, totalDays, config, timezone]);

  // Calculate task positions
  const taskPositions = useMemo(() => {
    const positions = new Map<string, { taskId: string; left: number; top: number; width: number; height: number }>();

    sortedTasks.forEach((task, idx) => {
      const schedDate = task.schedule_date || task.created_at;
      const dueDate = task.due_date;

      let taskStart: Date;
      let taskDuration: number;

      if (schedDate && dueDate) {
        taskStart = new Date(schedDate);
        taskDuration = Math.max(daysBetween(taskStart, new Date(dueDate)), 1);
      } else if (dueDate) {
        taskStart = new Date(dueDate);
        taskStart.setDate(taskStart.getDate() - 1);
        taskDuration = 2;
      } else if (schedDate) {
        taskStart = new Date(schedDate);
        taskDuration = 1;
      } else {
        taskStart = new Date();
        taskDuration = 1;
      }

      const startDay = daysBetween(startDate, taskStart);

      positions.set(task.id, {
        taskId: task.id,
        left: startDay * config.dayWidth,
        top: idx * ROW_HEIGHT + 4,
        width: Math.max(taskDuration * config.dayWidth, config.dayWidth),
        height: ROW_HEIGHT - 8,
      });
    });

    return positions;
  }, [sortedTasks, startDate, config]);

  // Collect dependencies
  const dependencies = useMemo(() => {
    const deps: { from_task_id: string; to_task_id: string }[] = [];
    for (const task of sortedTasks) {
      if (task.dependencies) {
        for (const dep of task.dependencies) {
          deps.push({
            from_task_id: dep.depends_on_task_id,
            to_task_id: dep.blocking_task_id,
          });
        }
      }
    }
    return deps;
  }, [sortedTasks]);

  // Today red line position
  const today = timezone ? todayInTimezone(timezone) : new Date();
  if (!timezone) today.setHours(0, 0, 0, 0);
  const todayOffset = daysBetween(startDate, today) * config.dayWidth;

  const chartWidth = totalDays * config.dayWidth;
  const chartHeight = sortedTasks.length * ROW_HEIGHT;

  return (
    <div className="flex flex-col h-full">
      {/* Zoom controls */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-slate-500 font-semibold uppercase">Zoom:</span>
        {(["day", "week", "month"] as ZoomLevel[]).map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${
              zoom === z ? "bg-red-500 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            {z.charAt(0).toUpperCase() + z.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden border border-slate-800 rounded-lg">
        {/* Task labels (left side) */}
        <div className="flex-shrink-0 border-r border-slate-800 bg-slate-950/50" style={{ width: LABEL_WIDTH }}>
          {/* Header spacer */}
          <div className="h-8 border-b border-slate-800 px-3 flex items-center">
            <span className="text-[10px] text-slate-500 font-semibold uppercase">Task</span>
          </div>
          {/* Task names */}
          <div className="overflow-y-auto" style={{ height: `calc(100% - 32px)` }}>
            {sortedTasks.map((task, idx) => (
              <div
                key={task.id}
                onClick={() => onSelect?.(task.id)}
                className="flex items-center gap-2 px-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
                style={{ height: ROW_HEIGHT }}
              >
                <span className={`text-xs truncate ${task.completed_at ? "line-through text-slate-500" : "text-slate-200"}`}>
                  {task.title}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart area (scrollable) */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          {/* Day headers */}
          <div className="flex h-8 border-b border-slate-800 sticky top-0 bg-slate-950/90 z-10" style={{ width: chartWidth }}>
            {dayColumns.map((col, i) => (
              <div
                key={i}
                className={`flex-shrink-0 flex items-center justify-center border-r border-slate-800/30 text-[9px] font-mono ${
                  col.isToday ? "bg-red-500/10 text-red-400 font-bold" : col.isWeekend ? "bg-slate-900/50 text-slate-600" : "text-slate-500"
                }`}
                style={{ width: config.dayWidth }}
              >
                {col.label}
              </div>
            ))}
          </div>

          {/* Chart body */}
          <div className="relative" style={{ width: chartWidth, height: chartHeight }}>
            {/* Grid lines */}
            {dayColumns.map((col, i) => (
              <div
                key={i}
                className={`absolute top-0 bottom-0 border-r ${
                  col.isWeekend ? "border-slate-800/50 bg-slate-900/20" : "border-slate-800/20"
                }`}
                style={{ left: i * config.dayWidth, width: config.dayWidth }}
              />
            ))}

            {/* Row separators */}
            {sortedTasks.map((_, idx) => (
              <div
                key={idx}
                className="absolute left-0 right-0 border-b border-slate-800/20"
                style={{ top: (idx + 1) * ROW_HEIGHT }}
              />
            ))}

            {/* Today line */}
            {todayOffset >= 0 && todayOffset <= chartWidth && (
              <div
                className="absolute top-0 bottom-0 w-px bg-red-500/60 z-10"
                style={{ left: todayOffset }}
              >
                <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-red-500" />
              </div>
            )}

            {/* Dependency lines */}
            <GanttDependencyLines
              dependencies={dependencies}
              taskPositions={taskPositions}
            />

            {/* Task bars */}
            {sortedTasks.map((task, idx) => {
              const pos = taskPositions.get(task.id);
              if (!pos) return null;

              const startDay = pos.left / config.dayWidth;
              const duration = pos.width / config.dayWidth;

              return (
                <GanttBar
                  key={task.id}
                  task={task}
                  startDay={startDay}
                  duration={duration}
                  dayWidth={config.dayWidth}
                  rowHeight={ROW_HEIGHT}
                  rowIndex={idx}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
