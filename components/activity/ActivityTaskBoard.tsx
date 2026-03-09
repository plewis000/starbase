"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import ListView from "./views/ListView";
import BoardView from "./views/BoardView";
import TimelineView from "./views/TimelineView";
import GanttView from "./views/GanttView";
import TodayView from "./views/TodayView";
import CalendarView, { type CalendarItem } from "@/components/ui/CalendarView";
import QuickAddBar from "./QuickAddBar";
import ActivityFilterBar, { type ActivityFilters, type SavedView, type GroupBy } from "./ActivityFilterBar";
import BulkActionBar from "./BulkActionBar";
import CompletionCelebration from "@/components/ui/CompletionCelebration";
import { useUserPreference } from "@/hooks/useUserPreferences";
import { useHouseholdTimezone } from "@/hooks/useHouseholdTimezone";

type ViewMode = "list" | "board" | "timeline" | "gantt" | "calendar" | "today";

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
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    })
  );

  const { timezone } = useHouseholdTimezone();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const { value: persistedViewMode, setValue: setPersistedViewMode } = useUserPreference<ViewMode>("activity_view_mode", "list");
  const [viewMode, setViewModeLocal] = useState<ViewMode>(persistedViewMode || "list");
  const [filters, setFilters] = useState<ActivityFilters>({
    status: "All",
    priority: "All",
    due: "All",
    search: "",
    sort: "due_date",
    direction: "asc",
    owner: "",
  });
  const { value: savedViews, setValue: setSavedViews, loading: savedViewsLoading } = useUserPreference<SavedView[]>("activity_saved_views", []);
  const { value: modeFilters, setValue: setModeFilters, loading: modeFiltersLoading } = useUserPreference<Record<string, Partial<ActivityFilters>>>("activity_mode_filters", {});
  const seededRef = useRef(false);

  // Refs to avoid stale closures in callbacks
  const savedViewsRef = useRef(savedViews);
  savedViewsRef.current = savedViews;
  const modeFiltersRef = useRef(modeFilters);
  modeFiltersRef.current = modeFilters;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  // Seed default views on first load if user has no saved views
  const SEED_VIEWS: SavedView[] = [
    { name: "All Tasks", icon: "📋", filters: { status: "All", priority: "All", due: "All", owner: "", sort: "due_date", direction: "asc" } },
    { name: "My Overdue", icon: "🔴", filters: { owner: "me", due: "overdue", status: "All", priority: "All", sort: "due_date", direction: "asc" } },
    { name: "Due Today", icon: "📅", filters: { due: "today", status: "All", priority: "All", owner: "", sort: "priority_id", direction: "asc" } },
    { name: "This Week", icon: "📆", filters: { due: "this_week", status: "All", priority: "All", owner: "", sort: "due_date", direction: "asc" } },
    { name: "High Priority", icon: "🔥", filters: { priority: "Urgent,High", status: "All", due: "All", owner: "", sort: "due_date", direction: "asc" } },
  ];

  useEffect(() => {
    if (savedViewsLoading || seededRef.current) return;
    seededRef.current = true;
    // If user has no views at all, seed with defaults
    if (savedViews.length === 0) {
      setSavedViews(SEED_VIEWS);
    }
  }, [savedViewsLoading, savedViews]);

  // Sync persisted view mode on first load
  useEffect(() => {
    if (persistedViewMode && persistedViewMode !== viewMode) {
      setViewModeLocal(persistedViewMode);
    }
  }, [persistedViewMode]);

  // Apply per-mode filters once preferences finish loading
  const appliedModeFiltersRef = useRef(false);
  useEffect(() => {
    if (modeFiltersLoading || savedViewsLoading) return;
    if (appliedModeFiltersRef.current) return;
    appliedModeFiltersRef.current = true;
    const modeF = modeFilters?.[viewMode];
    if (modeF) {
      setFilters(prev => ({ ...prev, ...modeF, search: prev.search }));
    }
  }, [modeFiltersLoading, savedViewsLoading]);

  // Mode switch handler — saves current mode's filters, restores target mode's
  const handleViewModeChange = useCallback((newMode: ViewMode) => {
    const currentFilters = filtersRef.current;
    const currentModeFilters = modeFiltersRef.current;
    const currentViewMode = viewModeRef.current;
    // Save current mode's filters (without search)
    const { search, ...filtersWithoutSearch } = currentFilters;
    setModeFilters({ ...currentModeFilters, [currentViewMode]: filtersWithoutSearch });
    // Switch mode
    setViewModeLocal(newMode);
    setPersistedViewMode(newMode);
    // Restore target mode's filters or defaults
    if (newMode === "today") {
      // Today view always shows items due today (tasks + habits)
      setFilters(prev => ({ status: "All", priority: "All", due: "today", owner: "", sort: "priority_id", direction: "asc", search: prev.search }));
    } else {
      const restored = currentModeFilters?.[newMode];
      if (restored) {
        setFilters(prev => ({ ...restored, search: prev.search }));
      } else {
        setFilters(prev => ({ status: "All", priority: "All", due: "All", owner: "", sort: "due_date", direction: "asc", search: prev.search }));
      }
    }
  }, [setModeFilters, setPersistedViewMode]);

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
    if (f.hideDoneDays) params.append("hide_done_days", f.hideDoneDays.toString());
    if (timezone) params.append("tz", timezone);
    params.append("limit", "100");
    return params.toString();
  }, [timezone]);

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
        // Sort done tasks to bottom while preserving server order within groups
        const sorted = [...(data.tasks || [])];
        sorted.sort((a: Task, b: Task) => {
          const aDone = !!a.completed_at;
          const bDone = !!b.completed_at;
          if (aDone !== bDone) return aDone ? 1 : -1;
          return 0;
        });
        setTasks(sorted);
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
      fetchTasks(filtersRef.current);
    }
  }, [tasks, config, fetchTasks, apiBasePath]);

  // Habit check-in handler (for TodayView)
  const handleHabitCheckIn = useCallback(async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const today = new Date().toISOString().split("T")[0];
    const wasChecked = !!(task as any).checked_today;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, checked_today: !wasChecked } as any : t
      )
    );

    try {
      if (wasChecked) {
        await apiFetch(`${apiBasePath}/${taskId}/completions?date=${today}`, { method: "DELETE" });
      } else {
        await apiFetch(`${apiBasePath}/${taskId}/completions`, {
          method: "POST",
          body: JSON.stringify({ completed_date: today }),
        });
        // Fire-and-forget entity link sync
        fetch("/api/entity-links/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_type: "habit", entity_id: taskId }),
        }).catch(() => {});
        setCompletedTaskId(taskId);
        setTimeout(() => setCompletedTaskId(null), 2000);
      }
    } catch {
      fetchTasks(filtersRef.current);
    }
  }, [tasks, fetchTasks, apiBasePath]);

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
        fetchTasks(filtersRef.current);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [fetchTasks, apiBasePath]);

  const handleFilterChange = useCallback((newFilters: ActivityFilters) => {
    setFilters(newFilters);
  }, []);

  const handleSaveView = useCallback((view: SavedView, oldName?: string) => {
    const current = savedViewsRef.current;
    let next: SavedView[];
    if (oldName && oldName !== view.name) {
      // Rename: replace the old entry with the new one
      next = current.map((v) => v.name === oldName ? view : v);
    } else {
      const existing = current.findIndex((v) => v.name === view.name);
      if (existing >= 0) {
        next = [...current];
        next[existing] = view;
      } else {
        next = [...current, view];
      }
    }
    setSavedViews(next);
  }, [setSavedViews]);

  const handleDeleteView = useCallback((viewName: string) => {
    const current = savedViewsRef.current;
    setSavedViews(current.filter((v) => v.name !== viewName));
  }, [setSavedViews]);

  const handleUpdateViewFilters = useCallback((viewName: string, newFilters: Partial<ActivityFilters>) => {
    const current = savedViewsRef.current;
    setSavedViews(current.map((v) =>
      v.name === viewName ? { ...v, filters: { ...newFilters } } : v
    ));
  }, [setSavedViews]);

  const handleResetView = useCallback((viewName: string) => {
    // Check if it's a seeded view — if so, restore to seed defaults
    const seed = SEED_VIEWS.find(v => v.name === viewName);
    if (seed) {
      const current = savedViewsRef.current;
      setSavedViews(current.map((v) =>
        v.name === viewName ? { ...v, filters: { ...seed.filters } } : v
      ));
      // Also reset current filters to the seed values
      setFilters({ ...seed.filters, search: "" } as ActivityFilters);
    }
  }, [setSavedViews]);

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
      fetchTasks(filtersRef.current);
    }
  }, [config, fetchTasks, apiBasePath]);

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
      const res = await apiFetch("/api/tasks/bulk", {
        method: "PATCH",
        body: JSON.stringify({ task_ids: ids, patch }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Bulk update failed:", errData.error || res.status);
      }
      setSelectedTaskIds(new Set());
      fetchTasks(filtersRef.current);
    } catch (err) { console.error("Bulk update failed:", err); }
  }, [selectedTaskIds, fetchTasks]);

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
      const res = await apiFetch("/api/tasks/bulk/tags", {
        method: "POST",
        body: JSON.stringify({ task_ids: ids, action, tag_id: tagId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Bulk tag update failed:", errData.error || res.status);
      }
      fetchTasks(filtersRef.current);
    } catch (err) { console.error("Bulk tag update failed:", err); }
  }, [selectedTaskIds, fetchTasks]);

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

  // Check if a view has been modified from its seed defaults
  const isViewModifiedFromSeed = useCallback((viewName: string) => {
    const seed = SEED_VIEWS.find(v => v.name === viewName);
    if (!seed) return false; // Not a seeded view, no "reset" concept
    const current = savedViewsRef.current.find(v => v.name === viewName);
    if (!current) return false;
    return JSON.stringify(seed.filters) !== JSON.stringify(current.filters);
  }, []);

  const activeViews = savedViews.filter((v: any) => !v.archived);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-dungeon-800 bg-dungeon-950/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <h1 className="text-lg font-bold text-slate-100 tracking-wide flex-shrink-0">Tasks</h1>
          <span className="text-xs text-slate-500 font-mono flex-shrink-0">{total} total</span>

          <div className="flex items-center gap-0.5 bg-dungeon-900 border border-dungeon-800 rounded-lg p-0.5 overflow-x-auto flex-shrink-0">
            {([
              { key: "today" as ViewMode, icon: "⚡", label: "Today" },
              { key: "list" as ViewMode, icon: "☰", label: "List" },
              { key: "board" as ViewMode, icon: "▦", label: "Board" },
              { key: "timeline" as ViewMode, icon: "═", label: "Timeline" },
              { key: "gantt" as ViewMode, icon: "▐", label: "Gantt" },
              { key: "calendar" as ViewMode, icon: "📅", label: "Cal" },
            ]).map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => handleViewModeChange(key)}
                title={label}
                className={`px-2 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                  viewMode === key
                    ? "bg-red-500 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <span className="mr-0.5">{icon}</span>
                <span className="hidden xl:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick add bar */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-dungeon-800/50">
        <QuickAddBar onAdd={handleQuickCreate} config={config} onOpenFullForm={onCreateTask} />
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-dungeon-800/50">
        <ActivityFilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          savedViews={activeViews}
          onSaveView={handleSaveView}
          onDeleteView={handleDeleteView}
          config={config}
          onUpdateViewFilters={handleUpdateViewFilters}
          onResetView={handleResetView}
          isViewModifiedFromSeed={isViewModifiedFromSeed}
          seedViewNames={SEED_VIEWS.map(v => v.name)}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-2 border-dungeon-700 border-t-red-500 rounded-full" />
          </div>
        ) : viewMode === "today" ? (
          <TodayView
            tasks={tasks}
            onQuickComplete={handleQuickComplete}
            onHabitCheckIn={handleHabitCheckIn}
            completedTaskId={completedTaskId}
            onSelect={handleSelectTask}
          />
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
            bulkMode={bulkMode}
            onToggleBulkMode={() => bulkMode ? exitBulkMode() : setBulkMode(true)}
            onTaskUpdated={() => fetchTasks(filtersRef.current)}
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
