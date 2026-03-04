"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useActivity } from "./ActivityProvider";
import ListView from "./views/ListView";
import BoardView from "./views/BoardView";
import TimelineView from "./views/TimelineView";
import QuickAddBar from "./QuickAddBar";
import ActivityFilterBar, { type ActivityFilters, type SavedView } from "./ActivityFilterBar";

type ViewMode = "list" | "board" | "timeline";

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
}

const SAVED_VIEWS_KEY = "activity_saved_views";

export default function ActivityTaskBoard() {
  const { activityFetch } = useActivity();
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
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [completedTaskId, setCompletedTaskId] = useState<string | null>(null);
  const fetchRef = useRef(0);

  // Load saved views from memory (Activity can't use localStorage in Discord iframe)
  // We'll store them via the config API in a future iteration
  // For now, use default presets
  const defaultViews: SavedView[] = [
    { name: "All Tasks", icon: "📋", filters: { status: "All", priority: "All", due: "All", owner: "", sort: "due_date", direction: "asc" } },
    { name: "My Overdue", icon: "🔴", filters: { owner: "me", due: "overdue", status: "All", priority: "All", sort: "due_date", direction: "asc" } },
    { name: "Due Today", icon: "📅", filters: { due: "today", status: "All", priority: "All", owner: "", sort: "priority_id", direction: "asc" } },
    { name: "This Week", icon: "📆", filters: { due: "this_week", status: "All", priority: "All", owner: "", sort: "due_date", direction: "asc" } },
    { name: "High Priority", icon: "🔥", filters: { priority: "Urgent,High", status: "All", due: "All", owner: "", sort: "due_date", direction: "asc" } },
  ];

  // Fetch config on mount
  useEffect(() => {
    activityFetch("/api/activity/config")
      .then((res) => res.json())
      .then((data) => setConfig(data))
      .catch((err) => console.error("Config fetch failed:", err));
  }, [activityFetch]);

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
      const res = await activityFetch(`/api/activity/tasks?${qs}`);
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
  }, [activityFetch, buildQueryString]);

  // Fetch on filter change
  useEffect(() => {
    fetchTasks(filters);
  }, [filters, fetchTasks]);

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
      await activityFetch(`/api/activity/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status_id: newStatusId }),
      });
    } catch {
      // Revert on error
      fetchTasks(filters);
    }
  }, [tasks, config, activityFetch, filters, fetchTasks]);

  // Quick create handler
  const handleQuickCreate = useCallback(async (title: string, dueDate?: string) => {
    try {
      const payload: Record<string, unknown> = { title };
      if (dueDate) payload.due_date = dueDate;

      const res = await activityFetch("/api/activity/tasks", {
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
  }, [activityFetch, filters, fetchTasks]);

  const handleFilterChange = useCallback((newFilters: ActivityFilters) => {
    setFilters(newFilters);
  }, []);

  const handleSaveView = useCallback((view: SavedView) => {
    setSavedViews((prev) => {
      const existing = prev.findIndex((v) => v.name === view.name);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = view;
        return updated;
      }
      return [...prev, view];
    });
  }, []);

  const allViews = [...defaultViews, ...savedViews];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header bar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-100 tracking-wide">Tasks</h1>
            <span className="text-xs text-slate-500 font-mono">{total} total</span>
          </div>

          {/* View switcher */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {([
              { key: "list", icon: "☰", label: "List" },
              { key: "board", icon: "▦", label: "Board" },
              { key: "timeline", icon: "═", label: "Timeline" },
            ] as const).map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                title={label}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  viewMode === key
                    ? "bg-crimson-600 text-white shadow-sm"
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

      {/* Quick add bar */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-800/50">
        <QuickAddBar onAdd={handleQuickCreate} />
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-800/50">
        <ActivityFilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          savedViews={allViews}
          onSaveView={handleSaveView}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-2 border-slate-700 border-t-crimson-500 rounded-full" />
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
          />
        ) : viewMode === "board" ? (
          <BoardView
            tasks={tasks}
            onQuickComplete={handleQuickComplete}
            completedTaskId={completedTaskId}
            config={config}
          />
        ) : (
          <TimelineView
            tasks={tasks}
            onQuickComplete={handleQuickComplete}
            completedTaskId={completedTaskId}
          />
        )}
      </div>
    </div>
  );
}
