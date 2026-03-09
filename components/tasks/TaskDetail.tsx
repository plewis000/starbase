"use client";

import React, { useState, useEffect, useRef } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ChecklistWidget from "./ChecklistWidget";
import CommentThread from "@/components/ui/CommentThread";
import EntityLinksSection from "@/components/ui/EntityLinksSection";
import CompletionCreditModal, { needsCreditModal } from "./CompletionCreditModal";
import { formatRelativeDate, getDateColor } from "@/lib/dateUtils";
import {
  InlineStatusPicker,
  InlinePriorityPicker,
  InlineTypePicker,
  InlineEffortPicker,
  InlineDatePicker,
  InlineTimeEstimate,
  InlineTagEditor,
} from "./InlineFieldEditors";
import RecurrenceEditor from "./RecurrenceEditor";
import SubtaskList from "./SubtaskList";
import { useTaskConfig } from "@/hooks/useTaskConfig";
import {
  Task,
  ActivityEntry,
} from "@/lib/types";

interface TaskDetailProps {
  taskId: string;
  onClose: () => void;
  onTaskUpdated?: () => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
}

// formatRelativeDate and getDateColor imported from @/lib/dateUtils

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
  due_date: "date",
  title: "title",
  description: "description",
  task_type_id: "type",
  recurrence_rule: "recurrence",
  effort_level_id: "effort",
  location_context_id: "location",
  completion_mode: "completion mode",
  estimated_minutes: "time estimate",
  actual_minutes: "actual time",
  owner_ids: "owners",
};

export default function TaskDetail({
  taskId,
  onClose,
  onTaskUpdated,
  onNavigatePrev,
  onNavigateNext,
}: TaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null);
  const pendingOwnerIdsRef = useRef<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editingRecurrence, setEditingRecurrence] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [creditModal, setCreditModal] = useState<{ open: boolean; doneStatusId: string }>({ open: false, doneStatusId: "" });

  const { config, refresh: refreshConfig, resolveStatusName, resolvePriorityName, resolveMemberName } = useTaskConfig();

  // Fetch current user ID
  useEffect(() => {
    fetch("/api/user").then(r => r.json()).then(d => {
      if (d.user?.id) setCurrentUserId(d.user.id);
    }).catch(() => {});
  }, []);

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
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Update failed (${response.status})`);
      }
      // Notify parent for list refresh, but don't refetch this task
      onTaskUpdated?.();
    } catch (err) {
      console.error("Task update failed:", err instanceof Error ? err.message : err, "patch:", patch);
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
    } catch (err) { console.error("Task refetch failed:", err); }
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
      <div className="bg-dungeon-900 border-l border-dungeon-800 w-full h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-100">Task Details</h2>
          <button onClick={onClose} className="text-dungeon-400 hover:text-slate-100 transition-colors">
            ✕
          </button>
        </div>
        <div className="text-center py-12">
          <p className="text-red-400">{error || "Task not found"}</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-dungeon-800 hover:bg-dungeon-700 text-slate-100 rounded transition-colors">
            Close
          </button>
        </div>
      </div>
    );
  }

  const allOwners = task.owners || (task.assignee ? [task.assignee] : []);

  return (
    <div className="bg-dungeon-900 border-l border-dungeon-800 w-full h-full flex flex-col">
      {/* Sticky header */}
      <div className="flex-shrink-0 px-6 py-4 bg-dungeon-900 border-b border-dungeon-800 sticky top-0 z-10">
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
                className="w-full bg-dungeon-800 border border-red-400 rounded px-3 py-2 text-xl font-semibold text-slate-100 focus:outline-none"
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
          <div className="flex-shrink-0 flex items-center gap-1">
            {(onNavigatePrev || onNavigateNext) && (
              <>
                <button
                  onClick={onNavigatePrev}
                  disabled={!onNavigatePrev}
                  className="p-1.5 rounded text-dungeon-400 hover:text-slate-100 hover:bg-dungeon-800 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                  title="Previous task"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                </button>
                <button
                  onClick={onNavigateNext}
                  disabled={!onNavigateNext}
                  className="p-1.5 rounded text-dungeon-400 hover:text-slate-100 hover:bg-dungeon-800 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                  title="Next task"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
              </>
            )}
            <button onClick={onClose} className="text-dungeon-400 hover:text-slate-100 transition-colors p-1.5">
              ✕
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="p-6 space-y-6 max-w-full">

        {/* Completion credit modal */}
        {creditModal.open && task && config && (
          <CompletionCreditModal
            open={creditModal.open}
            taskTitle={task.title}
            ownerIds={task.owner_ids || []}
            currentUserId={currentUserId}
            members={config.members}
            onConfirm={async (creditedTo) => {
              // Capture values before clearing modal state
              const doneStatusId = creditModal.doneStatusId;
              const taskId = task.id;
              const snapshotTask = structuredClone(task);
              setCreditModal({ open: false, doneStatusId: "" });
              // Now do the actual PATCH with credited_to
              setTask((prev) => prev ? { ...prev, status_id: doneStatusId, completed_at: new Date().toISOString() } as Task : prev);
              try {
                const response = await fetch(`/api/tasks/${taskId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status_id: doneStatusId, credited_to: creditedTo }),
                });
                if (!response.ok) throw new Error("Update failed");
                handleFieldUpdated();
              } catch {
                setTask(snapshotTask);
              }
            }}
            onCancel={() => setCreditModal({ open: false, doneStatusId: "" })}
          />
        )}

        {/* Inline Status Picker */}
        {config && (
          <div>
            <p className="text-xs text-dungeon-400 mb-2 font-semibold uppercase tracking-wider">Status</p>
            <InlineStatusPicker
              taskId={task.id}
              currentValue={task.status_id}
              options={config.statuses}
              onUpdated={handleFieldUpdated}
              onConfigAdded={handleConfigAdded}
              onBeforeUpdate={(statusId, statusName) => {
                if (statusName === "Done" && task) {
                  if (needsCreditModal(task.owner_ids || [])) {
                    setCreditModal({ open: true, doneStatusId: statusId });
                    return false; // Cancel default PATCH — modal will handle it
                  }
                }
                return true;
              }}
            />
          </div>
        )}

        {/* Inline Priority Picker */}
        {config && (
          <div>
            <p className="text-xs text-dungeon-400 mb-2 font-semibold uppercase tracking-wider">Priority</p>
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
            <p className="text-xs text-dungeon-400 mb-2 font-semibold uppercase tracking-wider">Type</p>
            <InlineTypePicker
              taskId={task.id}
              currentValue={task.task_type_id}
              options={config.task_types}
              onUpdated={handleFieldUpdated}
              onConfigAdded={handleConfigAdded}
            />
          </div>
        )}

        {/* Inline Effort Level Picker */}
        {config && config.effort_levels.length > 0 && (
          <div>
            <p className="text-xs text-dungeon-400 mb-2 font-semibold uppercase tracking-wider">Effort</p>
            <InlineEffortPicker
              taskId={task.id}
              currentValue={task.effort_level_id}
              options={config.effort_levels}
              onUpdated={handleFieldUpdated}
              onConfigAdded={handleConfigAdded}
            />
          </div>
        )}

        {/* Meta information card */}
        <div className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-4 space-y-4">
          {/* Due Date — inline editable */}
          <div className="flex items-center gap-3">
            <span className="text-dungeon-500 text-sm">📅</span>
            <div className="flex-1">
              <p className="text-xs text-dungeon-400 mb-1">Due</p>
              <div className="flex items-center gap-2">
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

          {/* Habit streak badge */}
          {task.is_habit && (
            <div className="flex items-center gap-3">
              <span className="text-dungeon-500 text-sm">🔥</span>
              <div className="flex-1">
                <p className="text-xs text-dungeon-400 mb-1">Streak</p>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-amber-400">
                    {task.streak_current || 0} day{(task.streak_current || 0) !== 1 ? "s" : ""}
                  </span>
                  <span className="text-xs text-dungeon-500">
                    Best: {task.streak_longest || 0}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Owners — multi-select toggle picker */}
          {config && (
            <div className="flex items-start gap-3">
              <span className="text-dungeon-500 text-sm mt-1">👥</span>
              <div className="flex-1">
                <p className="text-xs text-dungeon-400 mb-1.5">Owners</p>
                <div className="flex flex-wrap gap-1.5">
                  {config.members.map((m: any) => {
                    const name = m.user?.full_name || m.display_name || m.user_id;
                    const currentOwnerIds: string[] = task.owner_ids || [];
                    const isOwner = currentOwnerIds.includes(m.user_id);
                    return (
                      <button
                        key={m.user_id}
                        onClick={async () => {
                          // Use ref to track latest owner_ids across rapid clicks
                          const latestOwnerIds = pendingOwnerIdsRef.current || task.owner_ids || [];
                          const alreadyOwner = latestOwnerIds.includes(m.user_id);
                          const nextIds = alreadyOwner
                            ? latestOwnerIds.filter((id: string) => id !== m.user_id)
                            : [...latestOwnerIds, m.user_id];
                          pendingOwnerIdsRef.current = nextIds;
                          const nextOwners = nextIds
                            .map((id: string) => {
                              const member = config.members.find((cm: any) => cm.user_id === id);
                              if (!member) return null;
                              return {
                                id,
                                full_name: member.user?.full_name || member.display_name || id,
                                email: member.user?.email,
                                avatar_url: member.user?.avatar_url || null,
                              };
                            })
                            .filter(Boolean);
                          const snapshot = { ...task };
                          setTask((prev) => prev ? { ...prev, owner_ids: nextIds, owners: nextOwners, assignee: nextOwners[0] || null } as Task : prev);
                          try {
                            const response = await fetch(`/api/tasks/${task.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ owner_ids: nextIds }),
                            });
                            if (!response.ok) throw new Error("Update failed");
                            pendingOwnerIdsRef.current = null;
                            onTaskUpdated?.();
                          } catch {
                            pendingOwnerIdsRef.current = null;
                            setTask(snapshot);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition-all ${
                          isOwner
                            ? "bg-crimson-900/30 border-crimson-700 text-crimson-300"
                            : "bg-dungeon-800 border-dungeon-700 text-dungeon-400 hover:text-slate-200 hover:border-dungeon-600"
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-dungeon-600 flex items-center justify-center text-[8px] font-semibold flex-shrink-0">
                          {getInitials(name)}
                        </span>
                        {isOwner ? "- " : "+ "}{name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Completion Mode — only for multi-owner tasks */}
          {(task.owner_ids?.length || 0) > 1 && (
            <div className="flex items-start gap-3">
              <span className="text-dungeon-500 text-sm mt-1">🎮</span>
              <div className="flex-1">
                <p className="text-xs text-dungeon-400 mb-1.5">Completion Mode</p>
                <div className="flex gap-1.5">
                  {([
                    { value: "coop", label: "Co-op", desc: "Everyone gets credit" },
                    { value: "competitive", label: "Competitive", desc: "First to finish" },
                  ] as const).map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => handleOptimisticUpdate({ completion_mode: mode.value })}
                      title={mode.desc}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                        (task.completion_mode || "coop") === mode.value
                          ? "bg-crimson-900/30 border-crimson-700 text-crimson-300"
                          : "bg-dungeon-800 border-dungeon-700 text-dungeon-400 hover:text-slate-200 hover:border-dungeon-600"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}


          {/* Time Estimate */}
          <div className="flex items-start gap-3">
            <span className="text-dungeon-500 text-sm mt-0.5">⏱️</span>
            <div className="flex-1">
              <p className="text-xs text-dungeon-400 mb-1">Time</p>
              <InlineTimeEstimate
                taskId={task.id}
                estimatedMinutes={task.estimated_minutes}
                actualMinutes={task.actual_minutes}
                onUpdated={handleFieldUpdated}
              />
            </div>
          </div>

          {/* Creator */}
          {task.creator && (
            <div className="flex items-center gap-3">
              <span className="text-dungeon-500 text-sm">✏️</span>
              <div>
                <p className="text-xs text-dungeon-400">Created by</p>
                <p className="text-sm font-medium text-slate-100">{task.creator.full_name}</p>
              </div>
            </div>
          )}

          {/* Recurrence — inline editable */}
          <div className="flex items-start gap-3">
            <span className="text-dungeon-500 text-sm mt-0.5">🔄</span>
            <div className="flex-1">
              <p className="text-xs text-dungeon-400 mb-1">Recurrence</p>
              {editingRecurrence ? (
                <div className="space-y-3">
                  <RecurrenceEditor
                    value={task.recurrence_rule}
                    onChange={(rule) => {
                      handleOptimisticUpdate({ recurrence_rule: rule || null });
                    }}
                  />
                  <button
                    onClick={() => setEditingRecurrence(false)}
                    className="text-xs text-dungeon-500 hover:text-slate-300 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : task.recurrence_rule ? (
                <div
                  onClick={() => setEditingRecurrence(true)}
                  className="cursor-pointer hover:bg-dungeon-700/50 rounded px-2 py-1 -mx-2 -my-1 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-100">
                    {describeRRule(task.recurrence_rule)}
                    {task.recurrence_context?.occurrence_count && (
                      <span className="text-xs text-dungeon-400 ml-2">
                        (occurrence #{task.recurrence_context.occurrence_count})
                      </span>
                    )}
                  </p>
                  {task.recurrence_context?.next_due_date && (
                    <p className="text-xs text-dungeon-400 mt-0.5">
                      Next: {formatRelativeDate(task.recurrence_context.next_due_date)}
                    </p>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setEditingRecurrence(true)}
                  className="text-sm text-dungeon-500 hover:text-red-400 transition-colors italic"
                >
                  Add recurrence...
                </button>
              )}
            </div>
          </div>

          {/* Tags — inline editable */}
          <div className="flex items-start gap-3">
            <span className="text-dungeon-500 text-sm mt-1">🏷️</span>
            <div className="flex-1">
              <p className="text-xs text-dungeon-400 mb-2">Tags</p>
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
        <div className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-4">
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
              className="w-full bg-dungeon-700 border border-red-400 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none resize-none"
            />
          ) : (
            <div
              onClick={() => setEditingDescription(true)}
              className="text-sm text-slate-300 whitespace-pre-wrap cursor-pointer hover:bg-dungeon-700/50 rounded px-2 py-1.5 -mx-2 -my-1.5 transition-colors"
            >
              {task.description || (
                <span className="text-dungeon-500 italic">Click to add description...</span>
              )}
            </div>
          )}
        </div>

        {/* Checklist */}
        <div className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">
            Checklist
          </h3>
          <ChecklistWidget
            taskId={task.id}
            items={task.checklist_items}
            onUpdate={fetchTask}
          />
        </div>

        {/* Subtasks */}
        {(task.subtask_progress || task.subtasks?.length) && (
          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Subtasks</h3>
            <SubtaskList parentTaskId={task.id} />
          </div>
        )}

        {/* Linked Items */}
        <EntityLinksSection entityType="task" entityId={task.id} />

        {/* Discuss with Zev */}
        <a
          href={`/chat?entity_type=task&entity_id=${task.id}&prompt=${encodeURIComponent(`Let's discuss the task "${task.title}"`)}`}
          className="flex items-center gap-2 px-4 py-2.5 bg-dungeon-800 border border-dungeon-700 rounded-lg hover:border-amber-500/30 hover:bg-dungeon-750 transition-colors text-sm text-dungeon-400 hover:text-amber-400"
        >
          <span>💬</span>
          <span>Discuss with Zev</span>
        </a>

        {/* Comments */}
        <div className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3">Comments</h3>
          <CommentThread entityType="task" entityId={task.id} />
        </div>

        {/* Activity Log */}
        {task.activity.length > 0 && (
          <div className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-4">
            <button
              onClick={() => setShowActivityLog(!showActivityLog)}
              className="flex items-center justify-between w-full mb-3"
            >
              <h3 className="text-sm font-semibold text-slate-100">Activity</h3>
              <span className="text-dungeon-400 text-xs">{showActivityLog ? "▼" : "▶"}</span>
            </button>
            {showActivityLog && (
              <div className="space-y-2 text-sm">
                {task.activity.map((entry: ActivityEntry, idx: number) => {
                  const fieldLabel = FIELD_LABELS[entry.field_name || ""] || entry.field_name;
                  const performerName = resolveMemberName(entry.performed_by);
                  const hasFieldChange = entry.field_name && entry.old_value !== undefined;

                  // Resolve UUID values to human-readable names
                  let oldVal = entry.old_value;
                  let newVal = entry.new_value;
                  if (entry.field_name === "status_id") {
                    oldVal = resolveStatusName(oldVal) || oldVal;
                    newVal = resolveStatusName(newVal) || newVal;
                  } else if (entry.field_name === "priority_id") {
                    oldVal = resolvePriorityName(oldVal) || oldVal;
                    newVal = resolvePriorityName(newVal) || newVal;
                  } else if (entry.field_name === "assigned_to") {
                    oldVal = resolveMemberName(oldVal) || oldVal;
                    newVal = resolveMemberName(newVal) || newVal;
                  }

                  return (
                    <div key={idx} className="flex items-start gap-3">
                      <span className="text-dungeon-500 mt-0.5">→</span>
                      <div className="flex-1">
                        {hasFieldChange ? (
                          <p className="text-slate-300">
                            <span className="text-slate-100 font-medium">{performerName || "Someone"}</span>
                            {" changed "}
                            <span className="text-slate-200">{fieldLabel}</span>
                            {oldVal && (
                              <>
                                {" from "}
                                <span className="text-dungeon-400">{oldVal}</span>
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
                        <p className="text-xs text-dungeon-500">
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
    </div>
  );
}
