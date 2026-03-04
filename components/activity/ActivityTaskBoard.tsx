"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import ListView from "./views/ListView";
import BoardView from "./views/BoardView";
import TimelineView from "./views/TimelineView";
import GanttView from "./views/GanttView";
import CalendarView, { type CalendarItem } from "@/components/ui/CalendarView";
import QuickAddBar from "./QuickAddBar";
import ActivityFilterBar, { type ActivityFilters, type SavedView, type GroupBy } from "./ActivityFilterBar";
import BulkActionBar from "./BulkActionBar";
import CompletionCelebration from "@/components/ui/CompletionCelebration";
import { useUserPreference } from "@/hooks/useUserPreferences";
import { useHouseholdTimezone } from "@/hooks/useHouseholdTimezone";

type ViewMode = "list" | "board" | "timeline" | "gantt" | "calendar";

interface Task {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  completed_at?: string | null;
  status_id?: string;
  priority_id?: string;
  assigned_to?: string;
  recurrence_rule?: string;
  status?: { id: string; name: string; color?: string; icon?: string; sort_order: number };
  priority?: { id: string; name: string; color?: string; icon?: string; sort_order: number };
  assignee?: { id: string; full_name: string; email: string; avatar_url?: string | null };
  tags?: any[];
  checklist_items?: { id: string; title: string; checked: boolean; sort_order: number }[];
  subtask_progress?: { done: number; total: number };
}

interface ConfigData {
  statuses: { id: string; name: string; color?: string; sort_order: number }[];
  priorities: { id: string; name: string; color?: string; sort_order: number }[];
  members: { user_id: string; display_name?: string; user?: { id: string; full_name: string; email: string; avatar_url?: string | null } | null }[];
  task_types: { id: string; name: string; display_color?: string; icon?: string; sort_order: number }[];
  effort_levels: { id: string; name: string; display_color?: string; icon?: string; sort_order: number }[];
  tags: { id: string; name: string; display_color?: string; slug?: string }[];
}

interface ActivityTaskBoardProps {
  /** Optional custom fetch function (e.g. for Discord activity auth). Defaults to standard fetch. */
  customFetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** API base paths. Defaults to standard /api/tasks and /api/config */
  apiBasePath?: string;
  configPath?: string;
  /** Called when a task is selected */
  onSelectTask?: (taskId: string) => void;
  /** External refresh trigger — increment to refetch */
  refreshTrigger?: number;
  /** Called to open the create task modal */
  onCreateTask?: () => void;
}

export default function ActivityTaskBoard({
  customFetch,
  apiBasePath = "/api/tasks",
  configPath = "/api/config",
  onSelectTask,
  refreshTrigger = 0,
  onCreateTask,
}: ActivityTaskBoardProps) {
  const apiFetch = customFetch || ((url: string, init?: RequestInit) =>
    fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        "Content-Type": "application/json",
      },
    })
  );

  const { timezone } = useHouseholdTimezone();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filters, setFilters] = useState<ActivityFilters>({
    status: "All",
    priority: "All",
    due: "All",
    search: "",
    sort: "due_date",
    direction: "asc",
    owner: "",
  });
  const { value: savedViews, setValue: setSavedViews } = useUserPreference<SavedView[]>("activity_saved_views", []);
  const [completedTaskId, setCompletedTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const lastSelectedRef = useRef<string | null>(null);
  const fetchRef = useRef(0);

  const defaultViews: SavedView[] = [
    { name: "All Tasks", icon: "📋", isDefault: true, filters: { status: "All", priority: "All", due: "All", owner: "", sort: "due_date", direction: "asc" } },
    { name: "My Overdue", icon: "🔴", isDefault: true, filters: { owner: "me", due: "overdue", status: "All", priority: "All", sort: "due_date", direction: "asc" } },
    { name: "Due Today", icon: "📅", isDefault: true, filters: { due: "today", status: "All", priority: "All", owner: "", sort: "priority_id", direction: "asc" } },
    { name: "This Week", icon: "📆", isDefault: true, filters: { due: "this_week", status: "All", priority: "All", owner: "", sort: "due_date", direction: "asc" } },
    { name: "High Priority", icon: "🔥", isDefault: true, filters: { priority: "Urgent,High", status: "All", due: "All", owner: "", sort: "due_date", direction: "asc" } },
  ];

  // Fetch config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [configRes, membersRes, tagsRes] = await Promise.all([
          apiFetch(configPath),
          apiFetch("/api/household/members"),
          apiFetch("/api/tags"),
        ]);
        const configData = await configRes.json();
        const membersData = await membersRes.json();
        const tagsData = await tagsRes.json();
        setConfig({
          statuses: configData.statuses || [],
          priorities: configData.priorities || [],
          task_types: configData.types || [],
          effort_levels: configData.efforts || [],
          tags: tagsData.tags || [],
          members: membersData.members || [],
        });
      } catch (err) {
        console.error("Config fetch failed:", err);
      }
    };
    fetchConfig();
  }, []);

  // Build query string
  const buildQueryString = useCallback((f: ActivityFilters) => {
    const params = new URLSearchParams();
    if (f.status && f.status !== "All") params.append("status", f.status);
    if (f.priority && f.priority !== "All") params.append("priority", f.priority);
    if (f.owner === "me") params.append("owner", "me");
    if (f.due && f.due !== "All") params.append("due", f.due);
    if (f.search) params.append("search", f.search);
    if (f.sort) params.append("sort", f.sort);
    if (f.direction) params.append("direction", f.direction);
    params.append("limit", "100");
    return params.toString();
  }, []);

  // Fetch tasks
  const fetchTasks = useCallback(async (f: ActivityFilters) => {
    const fetchId = ++fetchRef.current;
    setLoading(true);
    try {
      const qs = buildQueryString(f);
      const res = await apiFetch(`${apiBasePath}?${qs}`);
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const data = await res.json();
      if (fetchId === fetchRef.current) {
        setTasks(data.tasks || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Task fetch error:", err);
    } finally {
      if (fetchId === fetchRef.current) setLoading(false);
    }
  }, [buildQueryString, apiBasePath]);

  // Fetch on filter change or external refresh
  useEffect(() => {
    fetchTasks(filters);
  }, [filters, fetchTasks, refreshTrigger]);

  // Quick complete handler
  const handleQuickComplete = useCallback(async (taskId: string) => {
    if (!config) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const isCompleted = !!task.completed_at;
    const doneStatus = config.statuses.find((s) => s.name === "Done");
    const todoStatus = config.statuses.find((s) => s.name === "To Do");

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              completed_at: isCompleted ? null : new Date().toISOString(),
              status: isCompleted ? todoStatus : doneStatus,
              status_id: isCompleted ? todoStatus?.id : doneStatus?.id,
            }
          : t
      )
    );

    if (!isCompleted) {
      setCompletedTaskId(taskId);
      setTimeout(() => setCompletedTaskId(null), 2000);
    }

    try {
      const newStatusId = isCompleted ? todoStatus?.id : doneStatus?.id;
      await apiFetch(`${apiBasePath}/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status_id: newStatusId }),
      });
      // Fire-and-forget entity link sync
      if (!isCompleted) {
        fetch("/api/entity-links/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_type: "task", entity_id: taskId }),
        }).catch(() => {});
      }
    } catch {
      // Revert on error
      fetchTasks(filters);
    }
  }, [tasks, config, filters, fetchTasks, apiBasePath]);

  // Quick create handler (extended with priority, assignee, tags)
  const handleQuickCreate = useCallback(async (
    title: string,
    dueDate?: string,
    extra?: { priority_id?: string; assigned_to?: string; tag_ids?: string[] }
  ) => {
    try {
      const payload: Record<string, unknown> = { title };
      if (dueDate) payload.due_date = dueDate;
      if (extra?.priority_id) payload.priority_id = extra.priority_id;
      if (extra?.assigned_to) payload.assigned_to = extra.assigned_to;
      if (extra?.tag_ids) payload.tag_ids = extra.tag_ids;

      const res = await apiFetch(apiBasePath, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        fetchTasks(filters);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [filters, fetchTasks, apiBasePath]);

  const handleFilterChange = useCallback((newFilters: ActivityFilters) => {
    setFilters(newFilters);
  }, []);

  const handleSaveView = useCallback((view: SavedView) => {
    const existing = savedViews.findIndex((v) => v.name === view.name);
    let next: SavedView[];
    if (existing >= 0) {
      next = [...savedViews];
      next[existing] = view;
    } else {
      next = [...savedViews, view];
    }
    setSavedViews(next);
  }, [savedViews, setSavedViews]);

  const handleDeleteView = useCallback((viewName: string) => {
    // Archive instead of delete (no deletion principle)
    setSavedViews(savedViews.map((v) =>
      v.name === viewName ? { ...v, archived: true } as any : v
    ));
  }, [savedViews, setSavedViews]);

  // Drag-and-drop status change handler (optimistic)
  const handleStatusChange = useCallback(async (taskId: string, newStatusId: string) => {
    const newStatus = config?.statuses.find((s) => s.id === newStatusId);
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status_id: newStatusId,
              status: newStatus ? { ...newStatus, sort_order: newStatus.sort_order } : t.status,
              completed_at: newStatus?.name === "Done" ? new Date().toISOString() : null,
            }
          : t
      )
    );

    try {
      await apiFetch(`${apiBasePath}/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status_id: newStatusId }),
      });
    } catch {
      fetchTasks(filters);
    }
  }, [config, filters, fetchTasks, apiBasePath]);

  // Bulk selection toggle (with shift+click range)
  const handleToggleSelect = useCallback((taskId: string, shiftKey: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedRef.current) {
        // Range select
        const lastIdx = tasks.findIndex((t) => t.id === lastSelectedRef.current);
        const curIdx = tasks.findIndex((t) => t.id === taskId);
        if (lastIdx >= 0 && curIdx >= 0) {
          const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
          for (let i = start; i <= end; i++) {
            next.add(tasks[i].id);
          }
        }
      } else {
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
      }
      lastSelectedRef.current = taskId;
      return next;
    });
  }, [tasks]);

  const handleBulkUpdate = useCallback(async (patch: Record<string, unknown>) => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    try {
      await apiFetch("/api/tasks/bulk", {
        method: "PATCH",
        body: JSON.stringify({ task_ids: ids, patch }),
      });
      setSelectedTaskIds(new Set());
      fetchTasks(filters);
    } catch { /* silent */ }
  }, [selectedTaskIds, filters, fetchTasks]);

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedTaskIds(new Set());
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedTaskIds.size === tasks.length && tasks.length > 0) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(tasks.map((t) => t.id)));
    }
  }, [tasks, selectedTaskIds]);

  const handleBulkArchive = useCallback(async () => {
    if (!config) return;
    const doneStatus = config.statuses.find((s) => s.name === "Done");
    if (!doneStatus) return;
    await handleBulkUpdate({ status_id: doneStatus.id });
  }, [config, handleBulkUpdate]);

  const handleBulkTagAction = useCallback(async (action: "add" | "remove", tagId: string) => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    try {
      await apiFetch("/api/tasks/bulk/tags", {
        method: "POST",
        body: JSON.stringify({ task_ids: ids, action, tag_id: tagId }),
      });
      fetchTasks(filters);
    } catch { /* silent */ }
  }, [selectedTaskIds, filters, fetchTasks]);

  // Auto-exit bulk mode on view change
  useEffect(() => {
    exitBulkMode();
  }, [viewMode]);

  // Escape key exits bulk mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && bulkMode) exitBulkMode();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [bulkMode, exitBulkMode]);

  const handleSelectTask = useCallback((taskId: string) => {
    onSelectTask?.(taskId);
  }, [onSelectTask]);

  const allViews = [...defaultViews, ...savedViews.filter((v: any) => !v.archived)];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-100 tracking-wide">Tasks</h1>
            <span className="text-xs text-slate-500 font-mono">{total} total</span>
          </div>

          {/* View switcher + new task */}
          <div className="flex items-center gap-2">
          {onCreateTask && (
            <button
              onClick={onCreateTask}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-1"
            >
              <span>+</span>
              <span className="hidden sm:inline">New Task</span>
            </button>
          )}
          <button
              onClick={() => bulkMode ? exitBulkMode() : setBulkMode(true)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                bulkMode
                  ? "bg-amber-600 hover:bg-amber-500 text-white"
                  : "border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
              }`}
            >
              {bulkMode ? "Exit Select" : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><polyline points="9 11 12 14 22 4" /></svg>
                  <span className="hidden sm:inline">Select</span>
                </>
              )}
            </button>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {([
              { key: "list" as ViewMode, icon: "☰", label: "List" },
              { key: "board" as ViewMode, icon: "▦", label: "Board" },
              { key: "timeline" as ViewMode, icon: "═", label: "Timeline" },
              { key: "gantt" as ViewMode, icon: "▐", label: "Gantt" },
              { key: "calendar" as ViewMode, icon: "📅", label: "Cal" },
            ]).map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                title={label}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  viewMode === key
                    ? "bg-red-500 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <span className="mr-1">{icon}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* Quick add bar */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-800/50">
        <QuickAddBar onAdd={handleQuickCreate} config={config} />
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-800/50">
        <ActivityFilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          savedViews={allViews}
          onSaveView={handleSaveView}
          onDeleteView={handleDeleteView}
          config={config}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-2 border-slate-700 border-t-red-500 rounded-full" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-slate-400 text-sm">No tasks match your filters</p>
            <p className="text-slate-600 text-xs mt-1">Try a different view or add a new task above</p>
          </div>
        ) : viewMode === "list" ? (
          <ListView
            tasks={tasks}
            onQuickComplete={handleQuickComplete}
            completedTaskId={completedTaskId}
            config={config}
            onSelect={handleSelectTask}
            selectedTaskIds={bulkMode ? selectedTaskIds : undefined}
            onToggleSelect={bulkMode ? handleToggleSelect : undefined}
            totalCount={bulkMode ? tasks.length : undefined}
            onSelectAll={bulkMode ? handleSelectAll : undefined}
            groupBy={filters.groupBy}
          />
        ) : viewMode === "board" ? (
          <BoardView
            tasks={tasks}
            onQuickComplete={handleQuickComplete}
            completedTaskId={completedTaskId}
            config={config}
            onSelect={handleSelectTask}
            onStatusChange={handleStatusChange}
          />
        ) : viewMode === "timeline" ? (
          <TimelineView
            tasks={tasks}
            onQuickComplete={handleQuickComplete}
            completedTaskId={completedTaskId}
            onSelect={handleSelectTask}
          />
        ) : viewMode === "gantt" ? (
          <GanttView
            tasks={tasks}
            onSelect={handleSelectTask}
            timezone={timezone}
          />
        ) : viewMode === "calendar" ? (
          <CalendarView
            items={tasks.map((t): CalendarItem => ({
              type: "task",
              id: t.id,
              title: t.title,
              date: t.due_date || "",
              color: t.completed_at ? "#22c55e" : "#ef4444",
              meta: { completed: !!t.completed_at },
            })).filter((i) => i.date)}
            timezone={timezone}
            onItemClick={(item) => handleSelectTask(item.id)}
          />
        ) : null}
      </div>

      {/* Completion celebration */}
      <CompletionCelebration
        show={!!completedTaskId}
        onComplete={() => setCompletedTaskId(null)}
      />

      {/* Bulk action bar */}
      {bulkMode && (
        <BulkActionBar
          selectedCount={selectedTaskIds.size}
          totalCount={tasks.length}
          config={config}
          onBulkUpdate={handleBulkUpdate}
          onBulkArchive={handleBulkArchive}
          onBulkTagAction={handleBulkTagAction}
          onClearSelection={() => setSelectedTaskIds(new Set())}
          onExitBulkMode={exitBulkMode}
        />
      )}
    </div>
  );
}
