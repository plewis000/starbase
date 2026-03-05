"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import FilterBar, { TaskFilters } from "./FilterBar";
import TaskCard from "./TaskCard";
import CompletionCreditModal, { needsCreditModal } from "./CompletionCreditModal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import CompletionCelebration from "@/components/ui/CompletionCelebration";
import { useToast } from "@/components/ui/Toast";
import { UserSummary } from "@/lib/types";

// Simple NLP for quick-add: extracts date keywords and returns clean title + due date
function parseQuickAddDate(input: string): { title: string; dueDate: string | null } {
  const today = new Date();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  // Patterns: "today", "tomorrow", "monday", "tuesday", etc.
  const patterns: [RegExp, () => Date][] = [
    [/\b(today)\b/i, () => today],
    [/\b(tonight)\b/i, () => today],
    [/\b(tomorrow)\b/i, () => { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }],
    ...dayNames.map((day, i) => [
      new RegExp(`\\b(${day})\\b`, "i"),
      () => {
        const d = new Date(today);
        const diff = (i - today.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        return d;
      },
    ] as [RegExp, () => Date]),
  ];

  for (const [pattern, getDate] of patterns) {
    if (pattern.test(input)) {
      const title = input.replace(pattern, "").replace(/\s+/g, " ").trim();
      const date = getDate();
      const dueDate = date.toISOString().split("T")[0];
      return { title: title || input, dueDate };
    }
  }

  return { title: input, dueDate: null };
}

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
  additional_owners?: UserSummary[];
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
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [members, setMembers] = useState<{ user_id: string; user?: UserSummary | null; display_name?: string }[]>([]);
  const [creditModal, setCreditModal] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });

  // Fetch current user ID and household members on mount
  useEffect(() => {
    fetch("/api/user").then(r => r.json()).then(d => {
      if (d.user?.id) setCurrentUserId(d.user.id);
    }).catch(() => {});
    fetch("/api/household/members").then(r => r.json()).then(d => {
      if (d.members) setMembers(d.members);
    }).catch(() => {});
  }, []);
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

      if (currentFilters.owner && currentFilters.owner === "me") {
        params.append("owner", "me");
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
  const [showCelebration, setShowCelebration] = useState(false);

  const handleLoadMore = () => {
    setOffset((prev) => prev + 1);
    fetchTasks(filters, false);
  };

  // Core completion logic — called directly or after credit modal
  const executeComplete = async (taskId: string, creditedTo?: string[]) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const isCompleted = task.status?.name === "Done" || !!task.completed_at;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, completed_at: isCompleted ? null : new Date().toISOString() }
          : t
      )
    );

    try {
      const configRes = await fetch("/api/config");
      const configData = await configRes.json();
      const statuses = configData.statuses || [];
      const targetStatus = isCompleted
        ? statuses.find((s: { name: string }) => s.name === "To Do")
        : statuses.find((s: { name: string }) => s.name === "Done");

      if (!targetStatus) {
        toast.error("Could not find target status");
        return;
      }

      const patchBody: Record<string, unknown> = { status_id: targetStatus.id };
      if (!isCompleted && creditedTo) {
        patchBody.credited_to = creditedTo;
      }

      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });

      if (!res.ok) throw new Error("Failed to update task");

      if (!isCompleted) {
        setShowCelebration(true);
        toast.success("Task complete!", {
          label: "Undo",
          onClick: () => handleQuickComplete(taskId),
        });
        fetch("/api/entity-links/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_type: "task", entity_id: taskId }),
        }).catch(() => {});
      }
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

  const handleQuickComplete = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const isCompleted = task.status?.name === "Done" || !!task.completed_at;

    // If un-completing, just do it directly
    if (isCompleted) {
      return executeComplete(taskId);
    }

    // Check if we need the credit modal
    const additionalOwnerIds = (task.additional_owners || []).map((o) => o.id);
    if (needsCreditModal(task.assignee?.id, additionalOwnerIds)) {
      setCreditModal({ open: true, task });
      return;
    }

    // Solo owner — auto-credit completer
    return executeComplete(taskId);
  };

  const handleQuickAdd = async () => {
    const rawTitle = quickAddTitle.trim();
    if (!rawTitle || quickAdding) return;

    // Simple NLP: extract date keywords from title
    const { title, dueDate } = parseQuickAddDate(rawTitle);

    setQuickAdding(true);
    try {
      const configRes = await fetch("/api/config");
      const configData = await configRes.json();
      const defaultStatus = configData.statuses?.[0]?.id;

      const payload: Record<string, unknown> = { title, status_id: defaultStatus };
      if (dueDate) payload.due_date = dueDate;

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      <CompletionCelebration
        show={showCelebration}
        onComplete={() => setShowCelebration(false)}
      />

      {/* Completion credit modal */}
      {creditModal.task && (
        <CompletionCreditModal
          open={creditModal.open}
          taskTitle={creditModal.task.title}
          assigneeId={creditModal.task.assignee?.id}
          additionalOwnerIds={(creditModal.task.additional_owners || []).map((o) => o.id)}
          currentUserId={currentUserId}
          members={members}
          onConfirm={(creditedTo) => {
            const taskId = creditModal.task!.id;
            setCreditModal({ open: false, task: null });
            executeComplete(taskId, creditedTo);
          }}
          onCancel={() => {
            setCreditModal({ open: false, task: null });
          }}
        />
      )}

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
          title="Your task board is empty"
          description="Start by adding your first task — anything from 'take out the trash' to 'plan vacation'. Quick-add above or tap the button."
          tip="Tip: Tasks are for one-time to-dos. For recurring things (daily cleanup, weekly laundry), try habits instead."
          action={{
            label: "Create Your First Task",
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
              members={members}
              onOwnersChanged={async (taskId, ownerIds) => {
                // Optimistic update
                setTasks((prev) =>
                  prev.map((t) => {
                    if (t.id !== taskId) return t;
                    const nextOwners = ownerIds
                      .map((id) => {
                        const m = members.find((mm) => mm.user_id === id);
                        if (!m) return null;
                        return { id, full_name: m.user?.full_name || m.display_name || id, avatar_url: m.user?.avatar_url || null };
                      })
                      .filter(Boolean) as UserSummary[];
                    return { ...t, additional_owners: nextOwners };
                  })
                );
                try {
                  const res = await fetch(`/api/tasks/${taskId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ additional_owners: ownerIds }),
                  });
                  if (!res.ok) throw new Error("Update failed");
                  onTaskUpdated?.();
                } catch {
                  fetchTasks(filters, true);
                }
              }}
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
