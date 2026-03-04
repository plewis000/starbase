"use client";

import React from "react";
import { DndContext, DragEndEvent, DragOverlay, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import BoardCard from "./BoardCard";

interface Task {
  id: string;
  title: string;
  due_date?: string;
  completed_at?: string | null;
  status_id?: string;
  status?: { id: string; name: string; color?: string; sort_order: number };
  priority?: { id: string; name: string; color?: string; sort_order: number };
  assignee?: { id: string; full_name: string; avatar_url?: string | null };
  subtask_progress?: { done: number; total: number };
}

interface ConfigStatus {
  id: string;
  name: string;
  color?: string;
  sort_order: number;
}

interface Props {
  tasks: Task[];
  onQuickComplete: (id: string) => void;
  completedTaskId: string | null;
  config: { statuses: ConfigStatus[]; [key: string]: any } | null;
  onSelect?: (id: string) => void;
  onStatusChange?: (taskId: string, newStatusId: string) => void;
}

// Fallback colors when no display_color is set
const FALLBACK_COLORS: Record<string, { border: string; bg: string; dot: string }> = {
  "To Do": { border: "border-slate-600", bg: "bg-slate-900/30", dot: "bg-slate-600" },
  "In Progress": { border: "border-blue-500", bg: "bg-blue-950/20", dot: "bg-blue-500" },
  "Blocked": { border: "border-red-500", bg: "bg-red-950/20", dot: "bg-red-500" },
  "Done": { border: "border-green-500", bg: "bg-green-950/20", dot: "bg-green-500" },
};

const DEFAULT_STYLE = { border: "border-slate-600", bg: "bg-slate-900/30", dot: "bg-slate-600" };

function getColumnStyle(status: ConfigStatus) {
  if (status.color) {
    return {
      borderColor: status.color,
      dotColor: status.color,
      bgClass: "bg-slate-900/30",
    };
  }
  const fallback = FALLBACK_COLORS[status.name] || DEFAULT_STYLE;
  return {
    borderColor: undefined,
    dotColor: undefined,
    bgClass: fallback.bg,
    borderClass: fallback.border,
    dotClass: fallback.dot,
  };
}

function DroppableColumn({
  columnId,
  children,
  style: colStyle,
  name,
  count,
}: {
  columnId: string;
  children: React.ReactNode;
  style: ReturnType<typeof getColumnStyle>;
  name: string;
  count: number;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: columnId });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-64 flex flex-col rounded-xl border ${colStyle.borderClass || ""} ${colStyle.bgClass} transition-all ${
        isOver ? "ring-2 ring-red-400/40 bg-red-950/10" : ""
      }`}
      style={colStyle.borderColor ? { borderColor: colStyle.borderColor } : undefined}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/50">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${colStyle.dotClass || ""}`}
            style={colStyle.dotColor ? { backgroundColor: colStyle.dotColor } : undefined}
          />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{name}</span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono">{count}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[60px]">
        {children}
      </div>
    </div>
  );
}

export default function BoardView({ tasks, onQuickComplete, completedTaskId, config, onSelect, onStatusChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Build columns dynamically from config statuses
  const columns = config?.statuses
    ? [...config.statuses].sort((a, b) => a.sort_order - b.sort_order)
    : [
        { id: "todo", name: "To Do", sort_order: 0 } as ConfigStatus,
        { id: "in-progress", name: "In Progress", sort_order: 1 } as ConfigStatus,
        { id: "blocked", name: "Blocked", sort_order: 2 } as ConfigStatus,
        { id: "done", name: "Done", sort_order: 3 } as ConfigStatus,
      ];

  // Group tasks by status_id
  const grouped: Record<string, Task[]> = {};
  for (const col of columns) {
    grouped[col.id] = [];
  }

  const firstColId = columns[0]?.id;

  for (const task of tasks) {
    const statusId = task.status_id || task.status?.id;
    if (statusId && grouped[statusId]) {
      grouped[statusId].push(task);
    } else if (firstColId) {
      grouped[firstColId] = grouped[firstColId] || [];
      grouped[firstColId].push(task);
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !onStatusChange) return;

    const taskId = active.id as string;
    const newStatusId = over.id as string;

    // Only fire if dropped on a different column
    const task = tasks.find((t) => t.id === taskId);
    const currentStatusId = task?.status_id || task?.status?.id;
    if (currentStatusId !== newStatusId) {
      onStatusChange(taskId, newStatusId);
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto h-full pb-2">
        {columns.map((col) => {
          const colTasks = grouped[col.id] || [];
          const style = getColumnStyle(col);
          const isDone = col.name.toLowerCase() === "done";

          return (
            <DroppableColumn
              key={col.id}
              columnId={col.id}
              style={style}
              name={col.name}
              count={colTasks.length}
            >
              {colTasks.map((task) => (
                <BoardCard
                  key={task.id}
                  task={task}
                  isDone={isDone}
                  isCompleted={task.id === completedTaskId}
                  onSelect={onSelect}
                  onQuickComplete={onQuickComplete}
                />
              ))}
              {colTasks.length === 0 && (
                <p className="text-[10px] text-slate-700 text-center py-4">Empty</p>
              )}
            </DroppableColumn>
          );
        })}
      </div>
    </DndContext>
  );
}
