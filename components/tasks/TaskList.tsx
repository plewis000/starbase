"use client";

import React, { useState, useEffect, useCallback } from "react";
import FilterBar, { TaskFilters } from "./FilterBar";
import TaskCard from "./TaskCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

interface Tag {
  id: string;
  tag_id: string;
  tag: {
    name: string;
    display_color?: string;
    icon?: string;
  };
}

interface ChecklistItem {
  id: string;
  title: string;
  checked: boolean;
  sort_order: number;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  completed_at?: string | null;
  status?: {
    id: string;
    name: string;
    color?: string;
    icon?: string;
    sort_order: number;
  };
  priority?: {
    id: string;
    name: string;
    color?: string;
    icon?: string;
    sort_order: number;
  };
  assignee?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
  };
  tags?: Tag[];
  checklist_items?: ChecklistItem[];
}

interface TaskListProps {
  onSelectTask: (id: string) => void;
  onCreateTask: () => void;
  onTaskUpdated?: () => void;
  selectedTaskId?: string;
}

export default function TaskList({
  onSelectTask,
  onCreateTask,
  onTaskUpdated,
  selectedTaskId,
}: TaskListProps) {
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<TaskFilters>({
    status: "All",
    priority: "All",
    due: "All",
    search: "",
    sort: "due_date",
    direction: "asc",
  });

  const [offset, setOffset] = useState(0);
  const pageSize = 50;

  // Build query string from filters
  const buildQueryString = useCallback(
    (currentFilters: TaskFilters, page: number = 0) => {
      const params = new URLSearchParams();

      if (
        currentFilters.status &&
        currentFilters.status !== "All"
      ) {
        params.append("status", currentFilters.status);
      }

      if (
        currentFilters.priority &&
        currentFilters.priority !== "All"
      ) {
        params.append("priority", currentFilters.priority);
      }

      if (currentFilters.due && currentFilters.due !== "All") {
        params.append("due", currentFilters.due);
      }

      if (currentFilters.search) {
        params.append("search", currentFilters.search);
      }

      if (currentFilters.sort) {
        params.append("sort", currentFilters.sort);
      }

      if (currentFilters.direction) {
        params.append("direction", currentFilters.direction);
      }

      params.append("offset", (page * pageSize).toString());
      params.append("limit", pageSize.toString());

      return params.toString();
    },
    []
  );

  // Fetch tasks from API
  const fetchTasks = useCallback(
    async (currentFilters: TaskFilters, reset: boolean = false) => {
      try {
        setLoading(true);

        const queryString = buildQueryString(
          currentFilters,
          reset ? 0 : offset
        );
        const response = await fetch(`/api/tasks?${queryString}`);

        if (!response.ok) {
          throw new Error("Failed to fetch tasks");
        }

        const data = await response.json();
        setTasks(reset ? data.tasks : [...tasks, ...data.tasks]);
        setTotal(data.total);
        if (reset) setOffset(0);
      } catch {
        toast.error("Failed to load tasks");
      } finally {
        setLoading(false);
      }
    },
    [offset, buildQueryString, tasks]
  );

  // Fetch on filter change
  useEffect(() => {
    fetchTasks(filters, true);
  }, [filters]);

  const handleFilterChange = (newFilters: TaskFilters) => {
    setFilters(newFilters);
  };

  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAdding, setQuickAdding] = useState(false);

  const handleLoadMore = () => {
    setOffset((prev) => prev + 1);
    fetchTasks(filters, false);
  };

  const handleQuickComplete = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const isCompleted = !!task.completed_at;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, completed_at: isCompleted ? null : new Date().toISOString() }
          : t
      )
    );

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed_at: isCompleted ? null : new Date().toISOString(),
        }),
      });
      onTaskUpdated?.();
    } catch {
      toast.error("Failed to update task");
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, completed_at: task.completed_at } : t
        )
      );
    }
  };

  const handleQuickAdd = async () => {
    const title = quickAddTitle.trim();
    if (!title || quickAdding) return;

    setQuickAdding(true);
    try {
      const configRes = await fetch("/api/config");
      const configData = await configRes.json();
      const defaultStatus = configData.task_statuses?.[0]?.id;

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, status_id: defaultStatus }),
      });

      if (res.ok) {
        setQuickAddTitle("");
        fetchTasks(filters, true);
        onTaskUpdated?.();
        toast.success("Task created");
      } else {
        toast.error("Failed to create task");
      }
    } catch {
      toast.error("Failed to create task");
    }
    setQuickAdding(false);
  };

  const hasMore = offset * pageSize + tasks.length < total;

  return (
    <div className="space-y-6">
      {/* Header with New Task button */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Tasks</h1>
          <p className="text-sm text-slate-400 mt-1">
            {total === 0 ? "No tasks yet" : `${total} total tasks`}
          </p>
        </div>
        <button
          onClick={onCreateTask}
          className="px-4 py-2 bg-red-400 hover:bg-red-500 text-slate-950 font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Task
        </button>
      </div>

      {/* Quick-add inline field */}
      <div className="flex gap-2">
        <input
          type="text"
          value={quickAddTitle}
          onChange={(e) => setQuickAddTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(); }}
          placeholder="Quick add task... (press Enter)"
          disabled={quickAdding}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500/50 disabled:opacity-50 transition-colors"
        />
      </div>

      {/* Filter bar */}
      <FilterBar onFilterChange={handleFilterChange} />

      {/* Tasks list or empty state */}
      {loading && tasks.length === 0 ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No tasks found"
          description="Create a new task or adjust your filters to get started."
          action={{
            label: "New Task",
            onClick: onCreateTask,
          }}
        />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onSelect={onSelectTask}
              onQuickComplete={handleQuickComplete}
              isSelected={selectedTaskId === task.id}
            />
          ))}

          {/* Load more button */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="px-6 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
