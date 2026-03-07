"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useUserPreference } from "@/hooks/useUserPreferences";
import { useIsMobile } from "@/hooks/useIsMobile";

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
  owner_ids?: string[];
  owners?: { id: string; full_name: string; email?: string; avatar_url?: string | null }[];
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
  totalCount?: number;
  onSelectAll?: () => void;
  bulkMode?: boolean;
  onToggleBulkMode?: () => void;
  onTaskUpdated?: () => void;
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
  { key: "due_date", label: "Due", width: "w-28" },
  { key: "type", label: "Type", width: "w-20" },
  { key: "effort", label: "Effort", width: "w-20" },
  { key: "tags", label: "Tags", width: "w-32" },
  { key: "created_at", label: "Created", width: "w-24" },
  { key: "recurrence", label: "Recur", width: "w-16" },
];

const DEFAULT_COLUMNS: ColumnKey[] = ["status", "priority", "assignee", "due_date", "tags"];
const DEFAULT_COLUMN_ORDER: ColumnKey[] = ["status", "priority", "assignee", "due_date", "type", "effort", "tags", "created_at", "recurrence"];

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
    case "Low": return "text-slate-400 bg-dungeon-800 border-dungeon-700";
    default: return "text-slate-500 bg-dungeon-900 border-dungeon-800";
  }
}

function statusIndicator(name?: string): string {
  switch (name) {
    case "To Do": return "border-slate-500";
    case "In Progress": return "border-blue-400 bg-blue-400/20";
    case "Blocked": return "border-red-500 bg-red-500/20";
    case "Done": return "border-green-500 bg-green-500";
    default: return "border-dungeon-600";
  }
}

function initials(name?: string): string {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// Inline cell editing for status/priority/type/effort
function InlineCellPicker({
  options,
  currentId,
  onSelect,
  colorFn,
  allowDeselect,
}: {
  options: { id: string; name: string }[];
  currentId?: string;
  onSelect: (id: string | null) => void;
  colorFn?: (name: string) => string;
  allowDeselect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === currentId);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border truncate max-w-full ${
          colorFn ? colorFn(current?.name || "") : "bg-dungeon-800 border-dungeon-700 text-slate-300"
        }`}
      >
        {current?.name || "—"}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-dungeon-800 border border-dungeon-700 rounded-lg shadow-xl py-1 min-w-[100px]">
          {allowDeselect && currentId && (
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(null); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400 italic hover:bg-dungeon-700 transition-colors"
            >
              None
            </button>
          )}
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={(e) => { e.stopPropagation(); onSelect(opt.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-dungeon-700 transition-colors ${
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

// Inline assignee picker
function InlineCellAssignee({
  task,
  members,
  onUpdate,
}: {
  task: Task;
  members: any[];
  onUpdate: (taskId: string, patch: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex items-center gap-1 hover:bg-dungeon-800 rounded px-1 py-0.5 transition-colors"
      >
        {task.assignee ? (
          <>
            <div className="w-5 h-5 rounded-full bg-dungeon-800 flex items-center justify-center text-[8px] font-bold text-slate-300 border border-dungeon-700" title={task.assignee.full_name}>
              {task.assignee.avatar_url ? (
                <img src={task.assignee.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : initials(task.assignee.full_name)}
            </div>
            <span className="text-[10px] text-slate-400 truncate">{task.assignee.full_name?.split(" ")[0]}</span>
          </>
        ) : (
          <span className="text-[10px] text-slate-600">—</span>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-dungeon-800 border border-dungeon-700 rounded-lg shadow-xl py-1 min-w-[120px]">
          <button
            onClick={(e) => { e.stopPropagation(); onUpdate(task.id, { owner_ids: [] }); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-dungeon-700 transition-colors ${
              !task.assigned_to && (!task.owner_ids || task.owner_ids.length === 0) ? "text-red-400 font-medium" : "text-slate-400 italic"
            }`}
          >
            Unassigned
          </button>
          {members.map((m: any) => {
            const name = m.user?.full_name || m.display_name || m.user_id;
            const userId = m.user_id;
            const isOwner = (task.owner_ids || []).includes(userId) || userId === task.assigned_to;
            return (
              <button
                key={userId}
                onClick={(e) => {
                  e.stopPropagation();
                  const currentIds = task.owner_ids || (task.assigned_to ? [task.assigned_to] : []);
                  const nextIds = isOwner
                    ? currentIds.filter((id: string) => id !== userId)
                    : [...currentIds, userId];
                  onUpdate(task.id, { owner_ids: nextIds });
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-dungeon-700 transition-colors flex items-center gap-2 ${
                  isOwner ? "text-red-400 font-medium" : "text-slate-200"
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-dungeon-700 flex items-center justify-center text-[7px] font-bold text-slate-300">
                  {initials(name)}
                </div>
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Inline date picker
function InlineCellDate({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (taskId: string, patch: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const presets = [
    { label: "Today", days: 0 },
    { label: "Tomorrow", days: 1 },
    { label: "Next week", days: 7 },
    { label: "None", days: -1 },
  ];

  const getDateStr = (days: number) => {
    if (days < 0) return null;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="hover:bg-dungeon-800 rounded px-1 py-0.5 transition-colors"
      >
        {task.due_date ? (
          <span className={`text-[10px] font-mono ${dateColor(task.due_date)}`}>{formatRelDate(task.due_date)}</span>
        ) : (
          <span className="text-[10px] text-slate-600">—</span>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-dungeon-800 border border-dungeon-700 rounded-lg shadow-xl py-1 min-w-[100px]">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={(e) => {
                e.stopPropagation();
                onUpdate(task.id, { due_date: getDateStr(p.days) });
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-dungeon-700 transition-colors"
            >
              {p.label}
            </button>
          ))}
          <div className="border-t border-dungeon-700 mt-1 pt-1 px-2 pb-1">
            <input
              type="date"
              defaultValue={task.due_date || ""}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                onUpdate(task.id, { due_date: e.target.value || null });
                setOpen(false);
              }}
              className="w-full bg-dungeon-700 border border-dungeon-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Inline tags editor
function InlineCellTags({
  task,
  availableTags,
  onUpdate,
}: {
  task: Task;
  availableTags: any[];
  onUpdate: (taskId: string, action: { type: "addTag" | "removeTag"; tagId: string; assocId?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentTagIds = (task.tags || []).map((t: any) => t.tag_id);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex gap-1 overflow-hidden hover:bg-dungeon-800 rounded px-1 py-0.5 transition-colors min-w-[20px]"
      >
        {task.tags && task.tags.length > 0 ? (
          task.tags.slice(0, 2).map((tag: any) => tag.tag && (
            <span key={tag.id} className="text-[10px] text-slate-500 truncate" style={{ color: tag.tag.display_color }}>
              {tag.tag.name}
            </span>
          ))
        ) : (
          <span className="text-[10px] text-slate-600">—</span>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-dungeon-800 border border-dungeon-700 rounded-lg shadow-xl py-1 min-w-[140px]">
          {availableTags.map((tag: any) => {
            const isActive = currentTagIds.includes(tag.id);
            const assoc = (task.tags || []).find((t: any) => t.tag_id === tag.id);
            return (
              <button
                key={tag.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isActive && assoc) {
                    onUpdate(task.id, { type: "removeTag", tagId: tag.id, assocId: assoc.tag_id });
                  } else {
                    onUpdate(task.id, { type: "addTag", tagId: tag.id });
                  }
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-dungeon-700 transition-colors flex items-center gap-2 ${
                  isActive ? "text-red-400 font-medium" : "text-slate-200"
                }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.display_color || "#64748b" }} />
                {tag.name}
                {isActive && <span className="ml-auto text-red-400">✓</span>}
              </button>
            );
          })}
          {availableTags.length === 0 && (
            <span className="px-3 py-1.5 text-xs text-slate-500">No tags configured</span>
          )}
        </div>
      )}
    </div>
  );
}

// Inline title editor
function InlineCellTitle({
  task,
  isCompleted,
  onUpdate,
}: {
  task: Task;
  isCompleted: boolean;
  onUpdate: (taskId: string, patch: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        type="text"
        defaultValue={task.title}
        autoFocus
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const val = e.currentTarget.value.trim();
          if (val && val !== task.title) onUpdate(task.id, { title: val });
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const val = e.currentTarget.value.trim();
            if (val && val !== task.title) onUpdate(task.id, { title: val });
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full bg-dungeon-800 border border-red-400 rounded px-2 py-0.5 text-sm font-medium text-slate-100 focus:outline-none"
      />
    );
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className={`text-sm font-medium truncate cursor-text hover:text-red-400 transition-colors ${isCompleted ? "line-through text-slate-500" : "text-slate-100"}`}
    >
      {task.title}
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

export default function ListView({ tasks, onQuickComplete, completedTaskId, config, onSelect, selectedTaskIds, onToggleSelect, groupBy, totalCount, onSelectAll, bulkMode, onToggleBulkMode, onTaskUpdated }: Props) {
  const { value: visibleColumns, setValue: setVisibleColumns } = useUserPreference<ColumnKey[]>("task_list_columns", DEFAULT_COLUMNS);
  const { value: columnOrder, setValue: setColumnOrder } = useUserPreference<ColumnKey[]>("task_list_column_order", DEFAULT_COLUMN_ORDER);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const isMobile = useIsMobile();

  const toggleColumn = useCallback((key: ColumnKey) => {
    const next = visibleColumns.includes(key) ? visibleColumns.filter((k) => k !== key) : [...visibleColumns, key];
    setVisibleColumns(next);
  }, [visibleColumns, setVisibleColumns]);

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...columnOrder];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setColumnOrder(next);
    setDragIdx(idx);
  }, [dragIdx, columnOrder, setColumnOrder]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
  }, []);

  const handleInlineUpdate = useCallback(async (taskId: string, patch: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) onTaskUpdated?.();
    } catch {}
  }, [onTaskUpdated]);

  const handleTagUpdate = useCallback(async (taskId: string, action: { type: "addTag" | "removeTag"; tagId: string; assocId?: string }) => {
    try {
      let res;
      if (action.type === "addTag") {
        res = await fetch(`/api/tasks/${taskId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag_ids: [action.tagId] }),
        });
      } else {
        res = await fetch(`/api/tasks/${taskId}/tags/${action.assocId}`, { method: "DELETE" });
      }
      if (res?.ok) onTaskUpdated?.();
    } catch {}
  }, [onTaskUpdated]);

  const activeColumns = columnOrder
    .filter((key) => visibleColumns.includes(key))
    .map((key) => ALL_COLUMNS.find((c) => c.key === key)!)
    .filter(Boolean);
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
                  "To Do": "bg-dungeon-700 border-dungeon-600 text-slate-300",
                  "In Progress": "bg-blue-900/30 border-blue-700 text-blue-300",
                  "Blocked": "bg-red-900/30 border-red-700 text-red-300",
                  "Done": "bg-green-900/30 border-green-700 text-green-300",
                };
                return colors[name] || "bg-dungeon-800 border-dungeon-700 text-slate-300";
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
        if (config?.members) {
          return <InlineCellAssignee task={task} members={config.members} onUpdate={handleInlineUpdate} />;
        }
        return task.assignee ? (
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded-full bg-dungeon-800 flex items-center justify-center text-[8px] font-bold text-slate-300 border border-dungeon-700" title={task.assignee.full_name}>
              {task.assignee.avatar_url ? (
                <img src={task.assignee.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : initials(task.assignee.full_name)}
            </div>
            <span className="text-[10px] text-slate-400 truncate">{task.assignee.full_name?.split(" ")[0]}</span>
          </div>
        ) : <span className="text-[10px] text-slate-600">—</span>;

      case "due_date":
        return <InlineCellDate task={task} onUpdate={handleInlineUpdate} />;

      case "type":
        if (config?.task_types) {
          return (
            <InlineCellPicker
              options={config.task_types}
              currentId={(task as any).task_type_id}
              onSelect={(id) => handleInlineUpdate(task.id, { task_type_id: id })}
              allowDeselect
            />
          );
        }
        return <span className="text-[10px] text-slate-500">{(task as any).task_type?.name || "—"}</span>;

      case "effort":
        if (config?.effort_levels) {
          return (
            <InlineCellPicker
              options={config.effort_levels}
              currentId={(task as any).effort_level_id}
              onSelect={(id) => handleInlineUpdate(task.id, { effort_level_id: id })}
              allowDeselect
            />
          );
        }
        return <span className="text-[10px] text-slate-500">{(task as any).effort_level?.name || "—"}</span>;

      case "tags":
        return <InlineCellTags task={task} availableTags={config?.tags || []} onUpdate={handleTagUpdate} />;

      case "created_at":
        return <span className="text-[10px] text-slate-600">{task.created_at ? formatRelDate(task.created_at) : "—"}</span>;

      case "recurrence":
        return task.recurrence_rule ? <span className="text-blue-400 text-xs">↻</span> : null;

      default:
        return null;
    }
  };

  // --- Mobile card row ---
  const renderMobileCard = (task: Task) => {
    const isCompleted = !!task.completed_at;
    const justCompleted = task.id === completedTaskId;

    return (
      <div
        key={task.id}
        onClick={() => onSelect?.(task.id)}
        className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all hover:bg-dungeon-900/80 cursor-pointer active:bg-dungeon-800/60 ${
          justCompleted ? "bg-green-900/10 ring-1 ring-green-500/20" : ""
        } ${isCompleted ? "opacity-50" : ""}`}
      >
        {/* Complete button — 44px touch target */}
        <button
          onClick={(e) => { e.stopPropagation(); onQuickComplete(task.id); }}
          className={`flex-shrink-0 w-[44px] h-[44px] rounded-full border-2 transition-all flex items-center justify-center ${
            isCompleted
              ? "bg-green-500 border-green-500 text-white"
              : `${statusIndicator(task.status?.name)} hover:border-green-400`
          }`}
        >
          {isCompleted && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${isCompleted ? "line-through text-slate-500" : "text-slate-100"}`}>
            {task.title}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {task.priority && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${priorityColor(task.priority.name)}`}>
                {task.priority.name}
              </span>
            )}
            {task.due_date && (
              <span className={`text-[10px] font-mono ${dateColor(task.due_date)}`}>{formatRelDate(task.due_date)}</span>
            )}
            {task.assignee && (
              <span className="text-[10px] text-slate-400">{task.assignee.full_name?.split(" ")[0]}</span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 flex-shrink-0">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    );
  };

  // --- Mobile layout ---
  if (isMobile) {
    return (
      <div className="space-y-0.5">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <div className="flex items-center gap-2 px-3 py-2 mt-3 first:mt-0">
                <div className="w-1 h-4 bg-red-500/60 rounded-full" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{group.label}</span>
                <span className="text-[10px] text-slate-600 font-mono">{group.tasks.length}</span>
              </div>
            )}
            {group.tasks.map(renderMobileCard)}
          </div>
        ))}
      </div>
    );
  }

  // --- Desktop layout ---
  return (
    <div>
      {/* List toolbar — bulk select + column picker */}
      <div className="flex items-center justify-end gap-1 mb-2">
        {onToggleBulkMode && (
          <button
            onClick={onToggleBulkMode}
            className={`p-1 transition-colors rounded ${
              bulkMode
                ? "text-amber-400 hover:text-amber-300 bg-amber-900/20"
                : "text-slate-500 hover:text-slate-300"
            }`}
            title={bulkMode ? "Exit select mode" : "Select tasks"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><polyline points="9 11 12 14 22 4" /></svg>
          </button>
        )}
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
            <div className="absolute right-0 top-full mt-1 z-30 bg-dungeon-800 border border-dungeon-700 rounded-lg shadow-xl py-1 min-w-[160px]">
              {columnOrder.map((key, idx) => {
                const col = ALL_COLUMNS.find((c) => c.key === key);
                if (!col) return null;
                return (
                  <div
                    key={col.key}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs text-slate-200 hover:bg-dungeon-700 cursor-grab ${
                      dragIdx === idx ? "bg-dungeon-700/50" : ""
                    }`}
                  >
                    <span className="text-slate-500 text-[10px] select-none cursor-grab">⠿</span>
                    <label className="flex items-center gap-2 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        className="rounded border-dungeon-600"
                      />
                      {col.label}
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-dungeon-800/50">
        {onToggleSelect && (
          <div className="w-5 flex-shrink-0 flex items-center justify-center">
            <input
              type="checkbox"
              ref={(el) => {
                if (el) {
                  const someSelected = (selectedTaskIds?.size ?? 0) > 0;
                  const allSelected = selectedTaskIds?.size === (totalCount ?? 0) && (totalCount ?? 0) > 0;
                  el.indeterminate = someSelected && !allSelected;
                }
              }}
              checked={selectedTaskIds?.size === (totalCount ?? 0) && (totalCount ?? 0) > 0}
              onChange={() => onSelectAll?.()}
              className="w-4 h-4 rounded border-dungeon-600 cursor-pointer"
            />
          </div>
        )}
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
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all hover:bg-dungeon-900/80 group cursor-pointer ${
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
                  className="flex-shrink-0 w-4 h-4 rounded border-dungeon-600 cursor-pointer"
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
                <InlineCellTitle task={task} isCompleted={isCompleted} onUpdate={handleInlineUpdate} />
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
