"use client";

import React, { useState, useEffect } from "react";
import StatusBadge from "@/components/ui/StatusBadge";
import PriorityBadge from "@/components/ui/PriorityBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import ChecklistWidget from "./ChecklistWidget";
import CommentThread from "@/components/ui/CommentThread";
import TaskForm from "./TaskForm";
import {
  Task,
  Tag,
  ChecklistItem,
  ActivityEntry,
  Dependency,
  Subtask,
  UserSummary,
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
  return fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

/** Format an RRULE into a human-readable label */
const formatRecurrenceRule = (rule: string): string => {
  const presets: Record<string, string> = {
    "FREQ=DAILY;INTERVAL=1": "Daily",
    "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR": "Weekdays",
    "FREQ=WEEKLY;INTERVAL=1": "Weekly",
    "FREQ=WEEKLY;INTERVAL=2": "Biweekly",
    "FREQ=MONTHLY;INTERVAL=1": "Monthly",
  };
  if (presets[rule]) return presets[rule];

  // Parse basic info
  const parts = rule.replace(/^RRULE:/i, "").split(";");
  const params: Record<string, string> = {};
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key && value) params[key.toUpperCase()] = value;
  }

  const freq = params.FREQ?.toLowerCase() || "unknown";
  const interval = params.INTERVAL ? parseInt(params.INTERVAL) : 1;
  if (interval === 1) return `Every ${freq.replace("ly", "")}`;
  return `Every ${interval} ${freq.replace("ly", "")}s`;
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);

  // Subtask add
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);

  const fetchTask = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tasks/${taskId}`);

      if (!response.ok) {
        throw new Error("Failed to fetch task");
      }

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

  const handleUpdateTitle = async (newTitle: string) => {
    if (!newTitle.trim() || !task) {
      setEditingTitle(false);
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to update task title");
      }

      const data = await response.json();
      setTask(data.task);
      setEditingTitle(false);
      onTaskUpdated?.();
    } catch {
      // Title update failed — user will see stale title
    }
  };

  const handleUpdateDescription = async (newDescription: string) => {
    if (!task) {
      setEditingDescription(false);
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: newDescription.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update task description");
      }

      const data = await response.json();
      setTask(data.task);
      setEditingDescription(false);
      onTaskUpdated?.();
    } catch {
      // Description update failed — user will see stale description
    }
  };

  const handleSaveForm = (updatedTask: Task) => {
    setTask(updatedTask);
    setShowEditModal(false);
    onTaskUpdated?.();
  };

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim() || !task) return;

    setAddingSubtask(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newSubtaskTitle.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to add subtask");
      }

      setNewSubtaskTitle("");
      await fetchTask();
      onTaskUpdated?.();
    } catch {
      // Subtask creation failed
    } finally {
      setAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtask: Subtask) => {
    const isDone = subtask.status?.name === "Done";
    try {
      // Toggle between Done and To Do
      const configRes = await fetch("/api/config");
      const configData = await configRes.json();
      const statuses = configData.statuses || [];
      const targetStatus = isDone
        ? statuses.find((s: { name: string }) => s.name === "To Do")
        : statuses.find((s: { name: string }) => s.name === "Done");

      if (!targetStatus) return;

      await fetch(`/api/tasks/${subtask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_id: targetStatus.id }),
      });

      await fetchTask();
      onTaskUpdated?.();
    } catch {
      // Toggle failed
    }
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
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="text-center py-12">
          <p className="text-red-400">{error || "Task not found"}</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const subtaskProgress = task.subtask_progress;
  const hasSubtasks = task.subtasks && task.subtasks.length > 0;
  const allOwners: UserSummary[] = [];
  if (task.assignee) allOwners.push({ id: task.assignee.id, full_name: task.assignee.full_name });
  if (task.additional_owners) {
    for (const o of task.additional_owners) {
      if (!allOwners.find((a) => a.id === o.id)) allOwners.push(o);
    }
  }

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
                  if (e.key === "Enter") {
                    handleUpdateTitle(e.currentTarget.value);
                  }
                  if (e.key === "Escape") {
                    setEditingTitle(false);
                  }
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
          <button
            onClick={onClose}
            className="flex-shrink-0 text-slate-400 hover:text-slate-100 transition-colors p-1"
          >
            ✕
          </button>
        </div>

        {/* Status, Priority, and Recurrence badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          {task.recurrence_rule && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/30">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {formatRecurrenceRule(task.recurrence_rule)}
            </span>
          )}
        </div>

        {/* Meta information card */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
          {/* Due date */}
          {task.due_date && (
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-sm">📅</span>
              <div>
                <p className="text-xs text-slate-400">Due date</p>
                <p className={`text-sm font-medium ${getDateColor(task.due_date)}`}>
                  {formatRelativeDate(task.due_date)}
                </p>
              </div>
            </div>
          )}

          {/* Owners */}
          {allOwners.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-sm">👥</span>
              <div className="flex-1">
                <p className="text-xs text-slate-400">
                  {allOwners.length === 1 ? "Assigned to" : `Owners (${allOwners.length})`}
                </p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {allOwners.map((owner) => (
                    <span
                      key={owner.id}
                      className="inline-flex items-center gap-1.5 text-sm text-slate-100"
                    >
                      <span className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-semibold text-slate-200 flex-shrink-0">
                        {getInitials(owner.full_name)}
                      </span>
                      {owner.full_name}
                    </span>
                  ))}
                </div>
                {allOwners.length > 1 && (
                  <p className="text-xs text-slate-500 mt-1">
                    XP split {allOwners.length}-way on completion
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Creator */}
          {task.creator && (
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-sm">✏️</span>
              <div>
                <p className="text-xs text-slate-400">Created by</p>
                <p className="text-sm font-medium text-slate-100">
                  {task.creator.full_name}
                </p>
              </div>
            </div>
          )}

          {/* Recurrence context */}
          {task.recurrence_context && (
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-sm">🔄</span>
              <div>
                <p className="text-xs text-slate-400">Recurrence</p>
                <p className="text-sm text-slate-100">
                  Occurrence #{task.recurrence_context.occurrence_count || 1}
                  {task.recurrence_context.next_due_date && (
                    <span className="text-slate-400">
                      {" "}· Next: {formatRelativeDate(task.recurrence_context.next_due_date)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Tags */}
          {task.tags.length > 0 && (
            <div className="flex items-start gap-3">
              <span className="text-slate-500 text-sm mt-1">🏷️</span>
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-2">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {task.tags.map((tagAssoc) => (
                    <span
                      key={tagAssoc.id}
                      className="px-2 py-1 rounded-full text-xs font-medium bg-slate-700"
                      style={{
                        color: tagAssoc.tag.display_color || undefined,
                        borderColor: tagAssoc.tag.display_color || undefined,
                        borderWidth: tagAssoc.tag.display_color ? "1px" : "0",
                      }}
                    >
                      {tagAssoc.tag.icon && (
                        <span className="mr-1">{tagAssoc.tag.icon}</span>
                      )}
                      {tagAssoc.tag.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-100">Description</h3>
            <button
              onClick={() => setEditingDescription(!editingDescription)}
              className="text-slate-400 hover:text-slate-100 transition-colors p-1"
            >
              ✏️
            </button>
          </div>
          {editingDescription ? (
            <textarea
              defaultValue={task.description || ""}
              onBlur={(e) => handleUpdateDescription(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditingDescription(false);
                }
              }}
              autoFocus
              rows={4}
              className="w-full bg-slate-700 border border-red-400 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none resize-none"
            />
          ) : (
            <div className="text-sm text-slate-300 whitespace-pre-wrap">
              {task.description || (
                <span className="text-slate-500 italic">No description</span>
              )}
            </div>
          )}
        </div>

        {/* Subtasks */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-100">
              Subtasks
              {subtaskProgress && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {subtaskProgress.done}/{subtaskProgress.total} done
                </span>
              )}
            </h3>
          </div>

          {/* Subtask progress bar */}
          {subtaskProgress && subtaskProgress.total > 0 && (
            <div className="mb-3">
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-400 transition-all duration-300"
                  style={{
                    width: `${(subtaskProgress.done / subtaskProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Subtask list */}
          {hasSubtasks && (
            <div className="space-y-2 mb-3">
              {task.subtasks.map((subtask) => {
                const isDone = subtask.status?.name === "Done";
                return (
                  <div key={subtask.id} className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleSubtask(subtask)}
                      className={`flex-shrink-0 w-4 h-4 rounded border-2 transition-colors flex items-center justify-center ${
                        isDone
                          ? "bg-red-500 border-red-500 text-white"
                          : "border-slate-600 hover:border-red-400"
                      }`}
                    >
                      {isDone && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                    <span
                      className={`flex-1 text-sm ${
                        isDone ? "text-slate-500 line-through" : "text-slate-100"
                      }`}
                    >
                      {subtask.title}
                    </span>
                    {subtask.assignee && (
                      <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-semibold text-slate-300 flex-shrink-0" title={subtask.assignee.full_name}>
                        {getInitials(subtask.assignee.full_name)}
                      </span>
                    )}
                    {subtask.due_date && (
                      <span className={`text-xs ${getDateColor(subtask.due_date)}`}>
                        {formatRelativeDate(subtask.due_date)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add subtask input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddSubtask();
                }
              }}
              placeholder="Add subtask..."
              disabled={addingSubtask}
              className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
            />
            <button
              onClick={handleAddSubtask}
              disabled={addingSubtask || !newSubtaskTitle.trim()}
              className="px-3 py-2 bg-red-400 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 text-sm font-medium rounded transition-colors"
            >
              {addingSubtask ? <LoadingSpinner size="sm" /> : "Add"}
            </button>
          </div>
        </div>

        {/* Checklist */}
        {task.checklist_items.length > 0 && (
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
        )}

        {/* Comments */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">Comments</h3>
          <CommentThread
            entityType="task"
            entityId={task.id}
          />
        </div>

        {/* Activity Log */}
        {task.activity.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <button
              onClick={() => setShowActivityLog(!showActivityLog)}
              className="flex items-center justify-between w-full mb-3"
            >
              <h3 className="text-sm font-semibold text-slate-100">
                Activity
              </h3>
              <span className="text-slate-400 text-xs">
                {showActivityLog ? "▼" : "▶"}
              </span>
            </button>
            {showActivityLog && (
              <div className="space-y-2 text-sm">
                {task.activity.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-slate-500">→</span>
                    <div className="flex-1">
                      <p className="text-slate-300 capitalize">
                        {entry.action}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatRelativeTime(entry.performed_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Edit button */}
        <button
          onClick={() => setShowEditModal(true)}
          className="w-full px-4 py-2 bg-red-400 hover:bg-red-500 text-slate-950 font-medium rounded transition-colors"
        >
          Edit Task
        </button>
      </div>

      {/* Edit modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Task"
        size="lg"
      >
        <TaskForm
          task={task}
          onSave={handleSaveForm}
          onCancel={() => setShowEditModal(false)}
        />
      </Modal>
    </div>
  );
}
