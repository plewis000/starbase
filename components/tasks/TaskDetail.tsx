"use client";

import React, { useState, useEffect } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ChecklistWidget from "./ChecklistWidget";
import CommentThread from "@/components/ui/CommentThread";
import EntityLinksSection from "@/components/ui/EntityLinksSection";
import {
  InlineStatusPicker,
  InlinePriorityPicker,
  InlineTypePicker,
  InlineDatePicker,
  InlineAssigneePicker,
  InlineTagEditor,
} from "./InlineFieldEditors";
import { useTaskConfig } from "@/hooks/useTaskConfig";
import {
  Task,
  ActivityEntry,
} from "@/lib/types";

interface TaskDetailProps {
  taskId: string;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

const formatRelativeDate = (dateString?: string): string => {
  if (!dateString) return "No date";
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Overdue (${Math.abs(diffDays)}d ago)`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return `In ${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const getDateColor = (dateString?: string): string => {
  if (!dateString) return "text-slate-400";
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "text-red-400";
  if (diffDays === 0 || diffDays === 1) return "text-amber-400";
  return "text-slate-400";
};

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const getInitials = (fullName?: string): string => {
  if (!fullName) return "?";
  return fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
};

function describeRRule(rule: string): string {
  if (!rule) return "";
  const PRESETS: Record<string, string> = {
    "FREQ=DAILY;INTERVAL=1": "Daily",
    "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR": "Every weekday",
    "FREQ=WEEKLY;INTERVAL=1": "Weekly",
    "FREQ=WEEKLY;INTERVAL=2": "Biweekly",
    "FREQ=MONTHLY;INTERVAL=1": "Monthly",
    "FREQ=MONTHLY;INTERVAL=3": "Quarterly",
  };
  if (PRESETS[rule]) return PRESETS[rule];
  const parts = Object.fromEntries(rule.split(";").map((p) => p.split("=")));
  const freq = parts.FREQ?.toLowerCase() || "custom";
  const interval = parts.INTERVAL ? parseInt(parts.INTERVAL) : 1;
  const byDay = parts.BYDAY;
  if (byDay) {
    const dayMap: Record<string, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
    const days = byDay.split(",").map((d: string) => dayMap[d] || d).join(", ");
    return interval > 1 ? `Every ${interval} weeks on ${days}` : `Weekly on ${days}`;
  }
  if (interval === 1) return `Every ${freq.replace("ly", "")}`;
  return `Every ${interval} ${freq.replace("ly", "")}s`;
}

const FIELD_LABELS: Record<string, string> = {
  status_id: "status",
  priority_id: "priority",
  assigned_to: "assignee",
  due_date: "due date",
  title: "title",
  description: "description",
  task_type_id: "type",
  recurrence_rule: "recurrence",
  effort_level_id: "effort",
};

export default function TaskDetail({
  taskId,
  onClose,
  onTaskUpdated,
}: TaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);

  const { config, refresh: refreshConfig, resolveStatusName, resolvePriorityName, resolveMemberName } = useTaskConfig();

  const fetchTask = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tasks/${taskId}`);
      if (!response.ok) throw new Error("Failed to fetch task");
      const data = await response.json();
      setTask(data.task);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTask();
  }, [taskId]);

  // Optimistic update: merge patch into local state immediately, then PATCH in background
  const handleOptimisticUpdate = async (patch: Record<string, unknown>) => {
    if (!task) return;
    // Save snapshot for rollback
    const snapshot = { ...task };
    // Merge patch into local state immediately (no flash)
    setTask((prev) => prev ? { ...prev, ...patch } as Task : prev);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("Update failed");
      // Notify parent for list refresh, but don't refetch this task
      onTaskUpdated?.();
    } catch {
      // Revert on error
      setTask(snapshot);
    }
  };

  const handleUpdateTitle = async (newTitle: string) => {
    if (!newTitle.trim() || !task) {
      setEditingTitle(false);
      return;
    }
    setEditingTitle(false);
    await handleOptimisticUpdate({ title: newTitle.trim() });
  };

  const handleUpdateDescription = async (newDescription: string) => {
    if (!task) {
      setEditingDescription(false);
      return;
    }
    setEditingDescription(false);
    await handleOptimisticUpdate({ description: newDescription.trim() || null });
  };

  // Silent refetch — no loading spinner flash
  const handleFieldUpdated = async () => {
    onTaskUpdated?.();
    try {
      const response = await fetch(`/api/tasks/${taskId}`);
      if (!response.ok) return;
      const data = await response.json();
      setTask(data.task);
    } catch { /* silent */ }
  };

  const handleConfigAdded = () => {
    refreshConfig();
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="bg-slate-900 border-l border-slate-800 w-full h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-100">Task Details</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors">
            ✕
          </button>
        </div>
        <div className="text-center py-12">
          <p className="text-red-400">{error || "Task not found"}</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded transition-colors">
            Close
          </button>
        </div>
      </div>
    );
  }

  const allOwners = [
    ...(task.assignee ? [task.assignee] : []),
    ...(task.additional_owners || []),
  ];

  return (
    <div className="bg-slate-900 border-l border-slate-800 w-full h-full overflow-y-auto">
      <div className="p-6 space-y-6 max-w-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                type="text"
                defaultValue={task.title}
                onBlur={(e) => handleUpdateTitle(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUpdateTitle(e.currentTarget.value);
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                autoFocus
                className="w-full bg-slate-800 border border-red-400 rounded px-3 py-2 text-xl font-semibold text-slate-100 focus:outline-none"
              />
            ) : (
              <h1
                onClick={() => setEditingTitle(true)}
                className="text-2xl font-bold text-slate-100 cursor-pointer hover:text-red-400 transition-colors truncate"
              >
                {task.title}
              </h1>
            )}
          </div>
          <button onClick={onClose} className="flex-shrink-0 text-slate-400 hover:text-slate-100 transition-colors p-1">
            ✕
          </button>
        </div>

        {/* Inline Status Picker */}
        {config && (
          <div>
            <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Status</p>
            <InlineStatusPicker
              taskId={task.id}
              currentValue={task.status_id}
              options={config.statuses}
              onUpdated={handleFieldUpdated}
              onConfigAdded={handleConfigAdded}
            />
          </div>
        )}

        {/* Inline Priority Picker */}
        {config && (
          <div>
            <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Priority</p>
            <InlinePriorityPicker
              taskId={task.id}
              currentValue={task.priority_id}
              options={config.priorities}
              onUpdated={handleFieldUpdated}
              onConfigAdded={handleConfigAdded}
            />
          </div>
        )}

        {/* Inline Type Picker */}
        {config && config.task_types.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Type</p>
            <InlineTypePicker
              taskId={task.id}
              currentValue={(task as any).task_type_id}
              options={config.task_types}
              onUpdated={handleFieldUpdated}
              onConfigAdded={handleConfigAdded}
            />
          </div>
        )}

        {/* Meta information card */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-4">
          {/* Due date — inline editable */}
          <div className="flex items-center gap-3">
            <span className="text-slate-500 text-sm">📅</span>
            <div className="flex-1">
              <p className="text-xs text-slate-400 mb-1">Due date</p>
              <div className="flex items-center gap-3">
                <InlineDatePicker
                  taskId={task.id}
                  currentValue={task.due_date}
                  onUpdated={handleFieldUpdated}
                />
                {task.due_date && (
                  <span className={`text-xs font-medium ${getDateColor(task.due_date)}`}>
                    {formatRelativeDate(task.due_date)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Assignee — inline editable */}
          {config && (
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-sm">👤</span>
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">Assigned to</p>
                <InlineAssigneePicker
                  taskId={task.id}
                  currentValue={task.assignee?.id}
                  members={config.members}
                  onUpdated={handleFieldUpdated}
                />
              </div>
            </div>
          )}

          {/* Additional owners (read-only display) */}
          {task.additional_owners && task.additional_owners.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-sm">👥</span>
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">Co-owners</p>
                <div className="flex flex-wrap gap-2">
                  {task.additional_owners.map((owner) => (
                    <span key={owner.id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-sm bg-slate-700 text-slate-200">
                      <span className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                        {getInitials(owner.full_name)}
                      </span>
                      {owner.full_name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Creator */}
          {task.creator && (
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-sm">✏️</span>
              <div>
                <p className="text-xs text-slate-400">Created by</p>
                <p className="text-sm font-medium text-slate-100">{task.creator.full_name}</p>
              </div>
            </div>
          )}

          {/* Recurrence info */}
          {task.recurrence_rule && (
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-sm">🔄</span>
              <div>
                <p className="text-xs text-slate-400">Recurrence</p>
                <p className="text-sm font-medium text-slate-100">
                  {describeRRule(task.recurrence_rule)}
                  {task.recurrence_context?.occurrence_count && (
                    <span className="text-xs text-slate-400 ml-2">
                      (occurrence #{task.recurrence_context.occurrence_count})
                    </span>
                  )}
                </p>
                {task.recurrence_context?.next_due_date && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Next: {formatRelativeDate(task.recurrence_context.next_due_date)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tags — inline editable */}
          <div className="flex items-start gap-3">
            <span className="text-slate-500 text-sm mt-1">🏷️</span>
            <div className="flex-1">
              <p className="text-xs text-slate-400 mb-2">Tags</p>
              <InlineTagEditor
                taskId={task.id}
                currentTags={task.tags}
                availableTags={config?.tags || []}
                onUpdated={handleFieldUpdated}
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">Description</h3>
          {editingDescription ? (
            <textarea
              defaultValue={task.description ?? ""}
              onBlur={(e) => handleUpdateDescription(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingDescription(false);
              }}
              autoFocus
              rows={4}
              className="w-full bg-slate-700 border border-red-400 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none resize-none"
            />
          ) : (
            <div
              onClick={() => setEditingDescription(true)}
              className="text-sm text-slate-300 whitespace-pre-wrap cursor-pointer hover:bg-slate-700/50 rounded px-2 py-1.5 -mx-2 -my-1.5 transition-colors"
            >
              {task.description || (
                <span className="text-slate-500 italic">Click to add description...</span>
              )}
            </div>
          )}
        </div>

        {/* Checklist */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">
            Checklist
          </h3>
          <ChecklistWidget
            taskId={task.id}
            items={task.checklist_items}
            onUpdate={fetchTask}
          />
        </div>

        {/* Linked Items */}
        <EntityLinksSection entityType="task" entityId={task.id} />

        {/* Comments */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">Comments</h3>
          <CommentThread entityType="task" entityId={task.id} />
        </div>

        {/* Activity Log */}
        {task.activity.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <button
              onClick={() => setShowActivityLog(!showActivityLog)}
              className="flex items-center justify-between w-full mb-3"
            >
              <h3 className="text-sm font-semibold text-slate-100">Activity</h3>
              <span className="text-slate-400 text-xs">{showActivityLog ? "▼" : "▶"}</span>
            </button>
            {showActivityLog && (
              <div className="space-y-2 text-sm">
                {task.activity.map((entry: ActivityEntry, idx: number) => {
                  const fieldLabel = FIELD_LABELS[(entry as any).field_name] || (entry as any).field_name;
                  const performerName = resolveMemberName((entry as any).performed_by);
                  const hasFieldChange = (entry as any).field_name && (entry as any).old_value !== undefined;

                  // Resolve UUID values to human-readable names
                  let oldVal = (entry as any).old_value;
                  let newVal = (entry as any).new_value;
                  if ((entry as any).field_name === "status_id") {
                    oldVal = resolveStatusName(oldVal) || oldVal;
                    newVal = resolveStatusName(newVal) || newVal;
                  } else if ((entry as any).field_name === "priority_id") {
                    oldVal = resolvePriorityName(oldVal) || oldVal;
                    newVal = resolvePriorityName(newVal) || newVal;
                  } else if ((entry as any).field_name === "assigned_to") {
                    oldVal = resolveMemberName(oldVal) || oldVal;
                    newVal = resolveMemberName(newVal) || newVal;
                  }

                  return (
                    <div key={idx} className="flex items-start gap-3">
                      <span className="text-slate-500 mt-0.5">→</span>
                      <div className="flex-1">
                        {hasFieldChange ? (
                          <p className="text-slate-300">
                            <span className="text-slate-100 font-medium">{performerName || "Someone"}</span>
                            {" changed "}
                            <span className="text-slate-200">{fieldLabel}</span>
                            {oldVal && (
                              <>
                                {" from "}
                                <span className="text-slate-400">{oldVal}</span>
                              </>
                            )}
                            {newVal && (
                              <>
                                {" to "}
                                <span className="text-slate-200 font-medium">{newVal}</span>
                              </>
                            )}
                          </p>
                        ) : (
                          <p className="text-slate-300 capitalize">
                            {performerName && <span className="text-slate-100 font-medium">{performerName} </span>}
                            {entry.action}
                          </p>
                        )}
                        <p className="text-xs text-slate-500">
                          {formatRelativeTime(entry.performed_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
