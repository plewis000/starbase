"use client";

import React, { useState, useEffect, useCallback } from "react";

interface Task {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  completed_at?: string | null;
  created_at?: string;
  recurrence_rule?: string;
  status_id?: string;
  priority_id?: string;
  assigned_to?: string;
  task_type_id?: string;
  effort_level_id?: string;
  status?: { id: string; name: string; color?: string; icon?: string; sort_order: number };
  priority?: { id: string; name: string; color?: string; icon?: string; sort_order: number };
  assignee?: { id: string; full_name: string; email: string; avatar_url?: string | null };
  tags?: any[];
  checklist_items?: { id: string; title: string; checked: boolean; sort_order: number }[];
  subtask_progress?: { done: number; total: number };
}

type GroupBy = "none" | "assignee" | "priority" | "status";

interface Props {
  tasks: Task[];
  onQuickComplete: (id: string) => void;
  completedTaskId: string | null;
  config: any;
  onSelect?: (id: string) => void;
  selectedTaskIds?: Set<string>;
  onToggleSelect?: (id: string, shiftKey: boolean) => void;
  groupBy?: GroupBy;
}

type ColumnKey = "status" | "priority" | "assignee" | "due_date" | "type" | "effort" | "tags" | "created_at" | "recurrence";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  width: string;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "status", label: "Status", width: "w-24" },
  { key: "priority", label: "Priority", width: "w-20" },
  { key: "assignee", label: "Assignee", width: "w-24" },
  { key: "due_date", label: "Due", width: "w-24" },
  { key: "type", label: "Type", width: "w-20" },
  { key: "effort", label: "Effort", width: "w-20" },
  { key: "tags", label: "Tags", width: "w-28" },
  { key: "created_at", label: "Created", width: "w-24" },
  { key: "recurrence", label: "Recur", width: "w-16" },
];

const DEFAULT_COLUMNS: ColumnKey[] = ["status", "priority", "assignee", "due_date", "tags"];
const LS_KEY = "task_list_columns";

function loadColumns(): ColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_COLUMNS;
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return DEFAULT_COLUMNS;
}

function saveColumns(cols: ColumnKey[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cols)); } catch {}
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

// Inline cell editing for status/priority
function InlineCellPicker({
  options,
  currentId,
  onSelect,
  colorFn,
}: {
  options: { id: string; name: string }[];
  currentId?: string;
  onSelect: (id: string) => void;
  colorFn?: (name: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === currentId);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border truncate max-w-full ${
          colorFn ? colorFn(current?.name || "") : "bg-slate-800 border-slate-700 text-slate-300"
        }`}
      >
        {current?.name || "—"}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[100px]">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={(e) => { e.stopPropagation(); onSelect(opt.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 transition-colors ${
                opt.id === currentId ? "text-red-400 font-medium" : "text-slate-200"
              }`}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function groupTasks(tasks: Task[], groupBy: GroupBy): { label: string; tasks: Task[] }[] {
  if (!groupBy || groupBy === "none") return [{ label: "", tasks }];

  const groups: Record<string, Task[]> = {};
  for (const task of tasks) {
    let key = "Ungrouped";
    switch (groupBy) {
      case "status": key = task.status?.name || "No Status"; break;
      case "priority": key = task.priority?.name || "No Priority"; break;
      case "assignee": key = task.assignee?.full_name || "Unassigned"; break;
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
  }

  return Object.entries(groups).map(([label, tasks]) => ({ label, tasks }));
}

export default function ListView({ tasks, onQuickComplete, completedTaskId, config, onSelect, selectedTaskIds, onToggleSelect, groupBy }: Props) {
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  useEffect(() => {
    setVisibleColumns(loadColumns());
  }, []);

  const toggleColumn = useCallback((key: ColumnKey) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      saveColumns(next);
      return next;
    });
  }, []);

  const handleInlineUpdate = useCallback(async (taskId: string, patch: Record<string, unknown>) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {}
  }, []);

  const activeColumns = ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key));
  const groups = groupTasks(tasks, groupBy || "none");

  const renderCell = (task: Task, col: ColumnDef) => {
    switch (col.key) {
      case "status":
        if (config?.statuses) {
          return (
            <InlineCellPicker
              options={config.statuses}
              currentId={task.status_id || task.status?.id}
              onSelect={(id) => handleInlineUpdate(task.id, { status_id: id })}
              colorFn={(name) => {
                const colors: Record<string, string> = {
                  "To Do": "bg-slate-700 border-slate-600 text-slate-300",
                  "In Progress": "bg-blue-900/30 border-blue-700 text-blue-300",
                  "Blocked": "bg-red-900/30 border-red-700 text-red-300",
                  "Done": "bg-green-900/30 border-green-700 text-green-300",
                };
                return colors[name] || "bg-slate-800 border-slate-700 text-slate-300";
              }}
            />
          );
        }
        return <span className="text-[10px] text-slate-500">{task.status?.name || "—"}</span>;

      case "priority":
        if (config?.priorities) {
          return (
            <InlineCellPicker
              options={config.priorities}
              currentId={task.priority_id || task.priority?.id}
              onSelect={(id) => handleInlineUpdate(task.id, { priority_id: id })}
              colorFn={priorityColor}
            />
          );
        }
        return task.priority ? (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${priorityColor(task.priority.name)}`}>
            {task.priority.icon || task.priority.name[0]}
          </span>
        ) : null;

      case "assignee":
        return task.assignee ? (
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-bold text-slate-300 border border-slate-700" title={task.assignee.full_name}>
              {task.assignee.avatar_url ? (
                <img src={task.assignee.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : initials(task.assignee.full_name)}
            </div>
            <span className="text-[10px] text-slate-400 truncate">{task.assignee.full_name?.split(" ")[0]}</span>
          </div>
        ) : <span className="text-[10px] text-slate-600">—</span>;

      case "due_date":
        return task.due_date ? (
          <span className={`text-[10px] font-mono ${dateColor(task.due_date)}`}>{formatRelDate(task.due_date)}</span>
        ) : <span className="text-[10px] text-slate-600">—</span>;

      case "type":
        return <span className="text-[10px] text-slate-500">{(task as any).task_type?.name || "—"}</span>;

      case "effort":
        return <span className="text-[10px] text-slate-500">{(task as any).effort_level?.name || "—"}</span>;

      case "tags":
        return (
          <div className="flex gap-1 overflow-hidden">
            {task.tags?.slice(0, 2).map((tag: any) => tag.tag && (
              <span key={tag.id} className="text-[10px] text-slate-500 truncate" style={{ color: tag.tag.display_color }}>
                {tag.tag.name}
              </span>
            ))}
          </div>
        );

      case "created_at":
        return <span className="text-[10px] text-slate-600">{task.created_at ? formatRelDate(task.created_at) : "—"}</span>;

      case "recurrence":
        return task.recurrence_rule ? <span className="text-blue-400 text-xs">↻</span> : null;

      default:
        return null;
    }
  };

  return (
    <div>
      {/* Column picker */}
      <div className="flex items-center justify-end mb-2">
        <div className="relative">
          <button
            onClick={() => setShowColumnPicker(!showColumnPicker)}
            className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
            title="Configure columns"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {showColumnPicker && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[140px]">
              {ALL_COLUMNS.map((col) => (
                <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(col.key)}
                    onChange={() => toggleColumn(col.key)}
                    className="rounded border-slate-600"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800/50">
        {onToggleSelect && <div className="w-5 flex-shrink-0" />}
        <div className="w-5 flex-shrink-0" />
        <div className="flex-1 min-w-0">Title</div>
        {activeColumns.map((col) => (
          <div key={col.key} className={`flex-shrink-0 ${col.width}`}>{col.label}</div>
        ))}
      </div>

      {/* Task rows (grouped) */}
      {groups.map((group, gi) => (
      <div key={gi}>
        {group.label && (
          <div className="flex items-center gap-2 px-3 py-2 mt-3 first:mt-0">
            <div className="w-1 h-4 bg-red-500/60 rounded-full" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{group.label}</span>
            <span className="text-[10px] text-slate-600 font-mono">{group.tasks.length}</span>
          </div>
        )}
      <div className="space-y-0.5">
        {group.tasks.map((task) => {
          const isCompleted = !!task.completed_at;
          const justCompleted = task.id === completedTaskId;
          const isSelected = selectedTaskIds?.has(task.id);
          const checklist = task.checklist_items || [];
          const checkDone = checklist.filter((c) => c.checked).length;

          return (
            <div
              key={task.id}
              onClick={() => onSelect?.(task.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all hover:bg-slate-900/80 group cursor-pointer ${
                justCompleted ? "bg-green-900/10 ring-1 ring-green-500/20" : ""
              } ${isCompleted ? "opacity-50" : ""} ${isSelected ? "bg-red-900/10 ring-1 ring-red-500/20" : ""}`}
            >
              {/* Selection checkbox */}
              {onToggleSelect && (
                <input
                  type="checkbox"
                  checked={isSelected || false}
                  onChange={() => {}}
                  onClick={(e) => { e.stopPropagation(); onToggleSelect(task.id, e.shiftKey); }}
                  className="flex-shrink-0 w-4 h-4 rounded border-slate-600 cursor-pointer"
                />
              )}

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

              {/* Title */}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${isCompleted ? "line-through text-slate-500" : "text-slate-100"}`}>
                  {task.title}
                </div>
                {/* Subtask/checklist progress inline */}
                {(task.subtask_progress?.total || checklist.length > 0) && (
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.subtask_progress && task.subtask_progress.total > 0 && (
                      <span className="text-[10px] text-slate-600">{task.subtask_progress.done}/{task.subtask_progress.total} subtasks</span>
                    )}
                    {checklist.length > 0 && (
                      <span className="text-[10px] text-slate-600">{checkDone}/{checklist.length} items</span>
                    )}
                  </div>
                )}
              </div>

              {/* Dynamic columns */}
              {activeColumns.map((col) => (
                <div key={col.key} className={`flex-shrink-0 ${col.width}`}>
                  {renderCell(task, col)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      </div>
      ))}
    </div>
  );
}
