"use client";

import React, { useState, useEffect } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import CommentThread from "@/components/ui/CommentThread";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EntityLinksSection from "@/components/ui/EntityLinksSection";
import { useToast } from "@/components/ui/Toast";

interface Milestone {
  id: string;
  title: string;
  target_date?: string;
  completed_at?: string;
  sort_order: number;
}

interface LinkedTask {
  id: string;
  title: string;
  status_id: string;
  completed_at?: string;
  due_date?: string;
  start_date?: string;
  schedule_date?: string;
  parent_task_id?: string;
  assigned_to?: string;
  owner_ids?: string[];
  priority_id?: string;
  is_habit?: boolean;
  recurrence_rule?: string;
}

interface GoalFull {
  id: string;
  title: string;
  description?: string;
  status: string;
  progress_type: string;
  progress_value: number;
  target_value?: number;
  current_value?: number;
  unit?: string;
  start_date: string;
  target_date?: string;
  completed_at?: string;
  category?: { name: string; icon?: string } | null;
  timeframe?: { name: string } | null;
  milestones?: Milestone[];
  linked_tasks?: LinkedTask[];
  activity?: { action: string; performed_at: string; metadata?: Record<string, unknown> }[];
}

interface GoalDetailProps {
  goalId: string;
  onClose: () => void;
  onGoalUpdated?: () => void;
  onSelectTask?: (taskId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: "text-red-400 bg-red-400/10",
  completed: "text-blue-400 bg-blue-400/10",
  paused: "text-amber-400 bg-amber-400/10",
  abandoned: "text-dungeon-400 bg-dungeon-400/10",
};

export default function GoalDetail({ goalId, onClose, onGoalUpdated, onSelectTask }: GoalDetailProps) {
  const toast = useToast();
  const [goal, setGoal] = useState<GoalFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [confirmAbandoned, setConfirmAbandoned] = useState(false);
  const [togglingMilestone, setTogglingMilestone] = useState<string | null>(null);

  useEffect(() => {
    const fetchGoal = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/goals/${goalId}`);
        if (!res.ok) throw new Error("Failed to fetch goal");
        const data = await res.json();
        setGoal(data.goal);
      } catch {
        toast.error("Failed to load goal");
      } finally {
        setLoading(false);
      }
    };
    fetchGoal();
  }, [goalId]);

  const handleToggleMilestone = async (milestone: Milestone) => {
    if (togglingMilestone) return;
    setTogglingMilestone(milestone.id);
    try {
      const completed = !milestone.completed_at;
      const res = await fetch(`/api/goals/${goalId}/milestones/${milestone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (res.ok) {
        // Re-fetch goal to get updated milestones and progress
        const goalRes = await fetch(`/api/goals/${goalId}`);
        if (goalRes.ok) {
          const data = await goalRes.json();
          setGoal(data.goal);
        }
        onGoalUpdated?.();
      }
    } catch {
      toast.error("Failed to update milestone");
    } finally {
      setTogglingMilestone(null);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!goal || updating) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setGoal(data.goal);
        onGoalUpdated?.();
        toast.success(`Goal ${newStatus}`);
      } else {
        toast.error("Failed to update goal status");
      }
    } catch {
      toast.error("Failed to update goal status");
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateProgress = async (value: number) => {
    if (!goal) return;
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress_value: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setGoal(data.goal);
        onGoalUpdated?.();
      }
    } catch {
      toast.error("Failed to update progress");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="p-6 text-center text-dungeon-400">Goal not found</div>
    );
  }

  const milestones = goal.milestones || [];
  const completedMilestones = milestones.filter((m) => m.completed_at).length;
  const linkedTasks = goal.linked_tasks || [];
  const progressPercent = Math.min(100, Math.round(goal.progress_value));

  // Task summary stats
  const totalTasks = linkedTasks.length;
  const doneTasks = linkedTasks.filter((t) => t.completed_at).length;
  const donePercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const today = new Date().toISOString().split("T")[0];
  const overdueTasks = linkedTasks.filter((t) => !t.completed_at && t.due_date && t.due_date < today);
  const upcomingDeadlines = linkedTasks
    .filter((t) => !t.completed_at && t.due_date)
    .sort((a, b) => (a.due_date! > b.due_date! ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-dungeon-900 border-b border-dungeon-800 px-6 py-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`px-2 py-1 rounded-md text-xs font-medium ${STATUS_COLORS[goal.status] || ""}`}>
              {goal.status}
            </span>
            {goal.category && (
              <span className="text-xs text-dungeon-400">
                {goal.category.icon} {goal.category.name}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-dungeon-400 hover:text-slate-100 transition-colors p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <h2 className="text-xl font-bold text-slate-100 mt-2">{goal.title}</h2>
      </div>

      <div className="p-6 space-y-6">
        {/* Description */}
        {goal.description && (
          <p className="text-slate-300 text-sm leading-relaxed">{goal.description}</p>
        )}

        {/* Progress section */}
        <div className="bg-dungeon-800/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100">Progress</span>
            <span className="text-sm text-dungeon-400">{progressPercent}%</span>
          </div>
          <div className="w-full bg-dungeon-700 rounded-full h-2.5">
            <div
              className="bg-red-400 h-2.5 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {goal.progress_type === "manual" && goal.status === "active" && (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="range"
                min="0"
                max="100"
                value={progressPercent}
                onChange={(e) => handleUpdateProgress(parseInt(e.target.value))}
                className="flex-1 accent-red-400"
              />
            </div>
          )}
          <div className="flex items-center gap-4 text-xs text-dungeon-400">
            <span>Type: {goal.progress_type.replace("_", " ")}</span>
            {goal.timeframe && <span>Timeframe: {goal.timeframe.name}</span>}
            {goal.target_date && (
              <span>Target: {new Date(goal.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            )}
          </div>
        </div>

        {/* Milestones */}
        {milestones.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-3">
              Milestones ({completedMilestones}/{milestones.length})
            </h3>
            <div className="space-y-2">
              {milestones.sort((a, b) => a.sort_order - b.sort_order).map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleToggleMilestone(m)}
                  disabled={togglingMilestone === m.id}
                  className="w-full flex items-center gap-3 p-3 bg-dungeon-900 rounded-lg border border-dungeon-800 hover:border-dungeon-600 transition-colors text-left disabled:opacity-50"
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    m.completed_at ? "border-red-400 bg-red-400/20" : "border-dungeon-600"
                  }`}>
                    {m.completed_at && (
                      <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${m.completed_at ? "text-dungeon-400 line-through" : "text-slate-100"}`}>
                      {m.title}
                    </span>
                  </div>
                  {m.target_date && (
                    <span className="text-xs text-dungeon-500 flex-shrink-0">
                      {new Date(m.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Task Summary Stats */}
        {totalTasks > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Task Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-dungeon-900 rounded-lg border border-dungeon-800 p-3 text-center">
                <div className="text-lg font-bold text-slate-100">{totalTasks}</div>
                <div className="text-xs text-dungeon-400">Total</div>
              </div>
              <div className="bg-dungeon-900 rounded-lg border border-dungeon-800 p-3 text-center">
                <div className="text-lg font-bold text-red-400">{doneTasks}</div>
                <div className="text-xs text-dungeon-400">Done ({donePercent}%)</div>
              </div>
              <div className="bg-dungeon-900 rounded-lg border border-dungeon-800 p-3 text-center">
                <div className="text-lg font-bold text-blue-400">{totalTasks - doneTasks}</div>
                <div className="text-xs text-dungeon-400">Remaining</div>
              </div>
              <div className="bg-dungeon-900 rounded-lg border border-dungeon-800 p-3 text-center">
                <div className={`text-lg font-bold ${overdueTasks.length > 0 ? "text-amber-400" : "text-dungeon-500"}`}>{overdueTasks.length}</div>
                <div className="text-xs text-dungeon-400">Overdue</div>
              </div>
            </div>
          </div>
        )}

        {/* Task List */}
        {totalTasks > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-3">
              Tasks ({doneTasks}/{totalTasks} done)
            </h3>
            <div className="space-y-1.5">
              {linkedTasks
                .sort((a, b) => (a.completed_at && !b.completed_at ? 1 : !a.completed_at && b.completed_at ? -1 : 0))
                .map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelectTask?.(t.id)}
                  className="w-full flex items-center gap-3 p-2.5 bg-dungeon-900 rounded-lg border border-dungeon-800 hover:border-dungeon-600 transition-colors text-left"
                >
                  <div className={`w-4 h-4 rounded-full flex-shrink-0 ${
                    t.completed_at ? "bg-red-400" : "bg-dungeon-600"
                  }`} />
                  <span className={`text-sm flex-1 min-w-0 truncate ${t.completed_at ? "text-dungeon-400 line-through" : "text-slate-100"}`}>
                    {t.title}
                  </span>
                  {t.is_habit && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-dungeon-800 text-dungeon-400 flex-shrink-0">routine</span>
                  )}
                  {t.due_date && !t.completed_at && (
                    <span className={`text-xs flex-shrink-0 ${t.due_date < today ? "text-amber-400" : "text-dungeon-500"}`}>
                      {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Deadlines */}
        {upcomingDeadlines.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Upcoming Deadlines</h3>
            <div className="space-y-2">
              {upcomingDeadlines.map((t) => {
                const isOverdue = t.due_date! < today;
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelectTask?.(t.id)}
                    className="w-full flex items-center gap-3 p-3 bg-dungeon-900 rounded-lg border border-dungeon-800 hover:border-dungeon-600 transition-colors text-left"
                  >
                    <span className="text-sm text-slate-100 flex-1 min-w-0 truncate">{t.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                      isOverdue
                        ? "bg-amber-400/10 text-amber-400"
                        : "bg-dungeon-800 text-dungeon-400"
                    }`}>
                      {new Date(t.due_date! + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Cross-Module Links */}
        <EntityLinksSection entityType="goal" entityId={goalId} />

        {/* Discuss with Zev */}
        <a
          href={`/chat?entity_type=goal&entity_id=${goalId}&prompt=${encodeURIComponent(`Let's discuss the goal "${goal.title}"`)}`}
          className="flex items-center gap-2 px-4 py-2.5 bg-dungeon-800 border border-dungeon-700 rounded-lg hover:border-amber-500/30 hover:bg-dungeon-750 transition-colors text-sm text-dungeon-400 hover:text-amber-400"
        >
          <span>💬</span>
          <span>Discuss with Zev</span>
        </a>

        {/* Status actions */}
        {goal.status === "active" && (
          <div className="flex items-center gap-2 pt-4 border-t border-dungeon-800">
            <button
              onClick={() => handleStatusChange("completed")}
              disabled={updating}
              className="px-4 py-2 bg-red-400 hover:bg-red-500 text-slate-950 font-medium rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {updating ? "Updating..." : "Mark Complete"}
            </button>
            <button
              onClick={() => handleStatusChange("paused")}
              disabled={updating}
              className="px-4 py-2 bg-dungeon-800 hover:bg-dungeon-700 text-slate-300 font-medium rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              Pause
            </button>
            <button
              onClick={() => setConfirmAbandoned(true)}
              disabled={updating}
              className="px-4 py-2 text-dungeon-500 hover:text-red-400 font-medium rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              Abandon
            </button>
          </div>
        )}
        {goal.status === "paused" && (
          <div className="flex items-center gap-2 pt-4 border-t border-dungeon-800">
            <button
              onClick={() => handleStatusChange("active")}
              className="px-4 py-2 bg-red-400 hover:bg-red-500 text-slate-950 font-medium rounded-lg transition-colors text-sm"
            >
              Resume
            </button>
          </div>
        )}

        {/* Comments */}
        <div>
          <h3 className="text-sm font-semibold text-slate-100 mb-3">Comments</h3>
          <div className="bg-dungeon-800/50 rounded-lg p-4">
            <CommentThread entityType="goal" entityId={goalId} />
          </div>
        </div>

        {/* Activity */}
        {goal.activity && goal.activity.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Activity</h3>
            <div className="space-y-2">
              {goal.activity.slice(0, 10).map((a, i) => (
                <div key={i} className="flex items-center gap-3 text-xs text-dungeon-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-dungeon-600 flex-shrink-0" />
                  <span>{a.action}</span>
                  <span className="ml-auto text-dungeon-500">
                    {new Date(a.performed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmAbandoned}
        title="Abandon Goal"
        message="Are you sure you want to abandon this goal? This can be undone later by resuming it."
        confirmLabel="Abandon"
        destructive
        onConfirm={() => { setConfirmAbandoned(false); handleStatusChange("abandoned"); }}
        onCancel={() => setConfirmAbandoned(false)}
      />
    </div>
  );
}
