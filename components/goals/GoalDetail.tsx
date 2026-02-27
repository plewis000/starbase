"use client";

import React, { useState, useEffect } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import CommentThread from "@/components/ui/CommentThread";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

interface Milestone {
  id: string;
  title: string;
  target_date?: string;
  completed_at?: string;
  sort_order: number;
}

interface LinkedHabit {
  id: string;
  title: string;
  status: string;
  current_streak: number;
  weight: number;
  check_in_history?: { check_date: string }[];
}

interface AvailableHabit {
  id: string;
  title: string;
  status: string;
  current_streak: number;
}

interface LinkedTask {
  id: string;
  title: string;
  status_id: string;
  completed_at?: string;
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
  linked_habits?: LinkedHabit[];
  linked_tasks?: LinkedTask[];
  activity?: { action: string; performed_at: string; metadata?: Record<string, unknown> }[];
}

interface GoalDetailProps {
  goalId: string;
  onClose: () => void;
  onGoalUpdated?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-400 bg-green-400/10",
  completed: "text-blue-400 bg-blue-400/10",
  paused: "text-amber-400 bg-amber-400/10",
  abandoned: "text-slate-400 bg-slate-400/10",
};

export default function GoalDetail({ goalId, onClose, onGoalUpdated }: GoalDetailProps) {
  const toast = useToast();
  const [goal, setGoal] = useState<GoalFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [confirmAbandoned, setConfirmAbandoned] = useState(false);
  const [showHabitPicker, setShowHabitPicker] = useState(false);
  const [availableHabits, setAvailableHabits] = useState<AvailableHabit[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedHabitsToAdd, setSelectedHabitsToAdd] = useState<string[]>([]);

  useEffect(() => {
    const fetchGoal = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/goals/${goalId}`);
        if (!res.ok) throw new Error("Failed to fetch goal");
        const data = await res.json();
        setGoal(data.goal);
      } catch (err) {
        console.error("Error fetching goal:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchGoal();
  }, [goalId]);

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

  const openHabitPicker = async () => {
    setShowHabitPicker(true);
    setPickerLoading(true);
    setSelectedHabitsToAdd([]);
    try {
      const res = await fetch("/api/habits?status=active");
      if (res.ok) {
        const data = await res.json();
        const linkedIds = new Set((goal?.linked_habits || []).map((h) => h.id));
        const available = (data.habits || []).filter((h: AvailableHabit) => !linkedIds.has(h.id));
        setAvailableHabits(available);
      }
    } catch {
      toast.error("Failed to load habits");
    } finally {
      setPickerLoading(false);
    }
  };

  const handleAddHabits = async () => {
    if (!goal || selectedHabitsToAdd.length === 0) return;
    try {
      const currentHabitIds = (goal.linked_habits || []).map((h) => h.id);
      const allHabitIds = [...currentHabitIds, ...selectedHabitsToAdd];
      const res = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habit_ids: allHabitIds }),
      });
      if (res.ok) {
        const data = await res.json();
        setGoal(data.goal);
        setShowHabitPicker(false);
        setSelectedHabitsToAdd([]);
        onGoalUpdated?.();
      }
    } catch {
      toast.error("Failed to link habits");
    }
  };

  const toggleHabitToAdd = (habitId: string) => {
    setSelectedHabitsToAdd((prev) =>
      prev.includes(habitId) ? prev.filter((id) => id !== habitId) : [...prev, habitId]
    );
  };

  const get7DayGrid = (habit: LinkedHabit) => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split("T")[0];
    });
    const checkInDates = new Set((habit.check_in_history || []).map((c) => c.check_date));
    return last7Days.map((date) => checkInDates.has(date));
  };

  const getHabitHealthCount = () => {
    if (!goal || goal.progress_type !== "habit_driven" || !goal.linked_habits) return 0;
    const today = new Date().toISOString().split("T")[0];
    return goal.linked_habits.filter((h) => {
      const checkInDates = new Set((h.check_in_history || []).map((c) => c.check_date));
      return checkInDates.has(today);
    }).length;
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
      <div className="p-6 text-center text-slate-400">Goal not found</div>
    );
  }

  const milestones = goal.milestones || [];
  const completedMilestones = milestones.filter((m) => m.completed_at).length;
  const linkedHabits = goal.linked_habits || [];
  const linkedTasks = goal.linked_tasks || [];
  const progressPercent = Math.min(100, Math.round(goal.progress_value));

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`px-2 py-1 rounded-md text-xs font-medium ${STATUS_COLORS[goal.status] || ""}`}>
              {goal.status}
            </span>
            {goal.category && (
              <span className="text-xs text-slate-400">
                {goal.category.icon} {goal.category.name}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors p-1">
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
        <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100">Progress</span>
            <span className="text-sm text-slate-400">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2.5">
            <div
              className="bg-green-400 h-2.5 rounded-full transition-all"
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
                className="flex-1 accent-green-400"
              />
            </div>
          )}
          <div className="flex items-center gap-4 text-xs text-slate-400">
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
                <div key={m.id} className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    m.completed_at ? "border-green-400 bg-green-400/20" : "border-slate-600"
                  }`}>
                    {m.completed_at && (
                      <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${m.completed_at ? "text-slate-400 line-through" : "text-slate-100"}`}>
                      {m.title}
                    </span>
                  </div>
                  {m.target_date && (
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {new Date(m.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linked Habits */}
        {(linkedHabits.length > 0 || goal.progress_type === "habit_driven") && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-100">
                Linked Habits {linkedHabits.length > 0 && `(${linkedHabits.length})`}
              </h3>
              {goal.progress_type === "habit_driven" && (
                <span className="text-xs text-green-400 font-medium">
                  {getHabitHealthCount()}/{linkedHabits.length} done today
                </span>
              )}
            </div>
            {goal.progress_type === "habit_driven" && linkedHabits.length === 0 && !showHabitPicker && (
              <button
                onClick={openHabitPicker}
                className="w-full px-4 py-2.5 bg-green-400 hover:bg-green-500 text-slate-950 font-medium rounded-lg transition-colors text-sm mb-3"
              >
                Link Habits
              </button>
            )}
            {showHabitPicker && (
              <div className="bg-slate-800/50 rounded-lg p-4 mb-3 space-y-3">
                {pickerLoading ? (
                  <p className="text-sm text-slate-400">Loading habits...</p>
                ) : availableHabits.length > 0 ? (
                  <>
                    <div className="space-y-2">
                      {availableHabits.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => toggleHabitToAdd(h.id)}
                          className={`w-full p-2 rounded-lg border text-left transition-colors text-sm ${
                            selectedHabitsToAdd.includes(h.id)
                              ? "border-green-400 bg-green-400/10"
                              : "border-slate-700 bg-slate-800 hover:border-slate-600"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedHabitsToAdd.includes(h.id)}
                              onChange={() => {}}
                              className="rounded accent-green-400"
                            />
                            <span className={selectedHabitsToAdd.includes(h.id) ? "text-green-400 font-medium" : "text-slate-100"}>
                              {h.title}
                            </span>
                            <span className="text-xs text-amber-400 ml-auto">🔥 {h.current_streak}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowHabitPicker(false)}
                        className="flex-1 px-3 py-2 text-slate-400 hover:text-slate-100 transition-colors text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddHabits}
                        disabled={selectedHabitsToAdd.length === 0}
                        className="flex-1 px-3 py-2 bg-green-400 hover:bg-green-500 text-slate-950 font-medium rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add ({selectedHabitsToAdd.length})
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-400">No more habits available to link</p>
                    <button
                      onClick={() => setShowHabitPicker(false)}
                      className="w-full px-3 py-2 text-slate-400 hover:text-slate-100 transition-colors text-sm font-medium"
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            )}
            {linkedHabits.length > 0 && (
              <div className="space-y-2">
                {linkedHabits.map((h) => {
                  const grid = get7DayGrid(h);
                  return (
                    <div key={h.id} className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-100">{h.title}</span>
                        <span className="text-xs text-amber-400 font-medium">🔥 {h.current_streak}d</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {grid.map((completed, i) => (
                          <div
                            key={i}
                            className={`w-5 h-5 rounded-sm text-xs flex items-center justify-center transition-colors ${
                              completed ? "bg-green-400" : "bg-slate-800 border border-slate-700"
                            }`}
                          >
                            {completed && <span className="text-slate-950 font-bold">✓</span>}
                          </div>
                        ))}
                      </div>
                      {goal.progress_type === "habit_driven" && (
                        <div className="text-xs text-slate-400">
                          Weight: <span className="text-slate-300 font-medium">{(h.weight * 100).toFixed(0)}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {goal.progress_type === "habit_driven" && !showHabitPicker && (
                  <button
                    onClick={openHabitPicker}
                    className="w-full px-3 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium rounded-lg transition-colors text-sm"
                  >
                    Link More Habits
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Linked Tasks */}
        {linkedTasks.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Linked Tasks</h3>
            <div className="space-y-2">
              {linkedTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <div className={`w-4 h-4 rounded-full flex-shrink-0 ${
                    t.completed_at ? "bg-green-400" : "bg-slate-600"
                  }`} />
                  <span className={`text-sm ${t.completed_at ? "text-slate-400 line-through" : "text-slate-100"}`}>
                    {t.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status actions */}
        {goal.status === "active" && (
          <div className="flex items-center gap-2 pt-4 border-t border-slate-800">
            <button
              onClick={() => handleStatusChange("completed")}
              disabled={updating}
              className="px-4 py-2 bg-green-400 hover:bg-green-500 text-slate-950 font-medium rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {updating ? "Updating..." : "Mark Complete"}
            </button>
            <button
              onClick={() => handleStatusChange("paused")}
              disabled={updating}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              Pause
            </button>
            <button
              onClick={() => setConfirmAbandoned(true)}
              disabled={updating}
              className="px-4 py-2 text-slate-500 hover:text-red-400 font-medium rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              Abandon
            </button>
          </div>
        )}
        {goal.status === "paused" && (
          <div className="flex items-center gap-2 pt-4 border-t border-slate-800">
            <button
              onClick={() => handleStatusChange("active")}
              className="px-4 py-2 bg-green-400 hover:bg-green-500 text-slate-950 font-medium rounded-lg transition-colors text-sm"
            >
              Resume
            </button>
          </div>
        )}

        {/* Comments */}
        <div>
          <h3 className="text-sm font-semibold text-slate-100 mb-3">Comments</h3>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <CommentThread entityType="goal" entityId={goalId} />
          </div>
        </div>

        {/* Activity */}
        {goal.activity && goal.activity.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Activity</h3>
            <div className="space-y-2">
              {goal.activity.slice(0, 10).map((a, i) => (
                <div key={i} className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600 flex-shrink-0" />
                  <span>{a.action}</span>
                  <span className="ml-auto text-slate-500">
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
