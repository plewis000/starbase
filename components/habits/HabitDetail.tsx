"use client";

import React, { useState, useEffect } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import CommentThread from "@/components/ui/CommentThread";

interface CheckIn {
  id: string;
  check_date: string;
  value?: number;
  note?: string;
  mood?: string;
}

interface HabitFull {
  id: string;
  title: string;
  description?: string;
  status: string;
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  last_completed_at?: string;
  started_on: string;
  frequency?: { name: string } | null;
  category?: { name: string; icon?: string } | null;
  time_preference?: { name: string } | null;
  specific_days?: number[];
  target_count: number;
  checked_today?: boolean;
  check_in_history?: CheckIn[];
  linked_goals?: { id: string; title: string; status: string; progress_value: number }[];
}

interface AvailableGoal {
  id: string;
  title: string;
  progress_type: string;
  progress_value: number;
}

interface HabitDetailProps {
  habitId: string;
  onClose: () => void;
  onHabitUpdated?: () => void;
}

const MOOD_EMOJI: Record<string, string> = {
  great: "😄",
  good: "🙂",
  neutral: "😐",
  tough: "😓",
  terrible: "😞",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function HabitDetail({ habitId, onClose, onHabitUpdated }: HabitDetailProps) {
  const [habit, setHabit] = useState<HabitFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkInNote, setCheckInNote] = useState("");
  const [checkInMood, setCheckInMood] = useState<string>("");
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [availableGoals, setAvailableGoals] = useState<AvailableGoal[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedGoalsToAdd, setSelectedGoalsToAdd] = useState<string[]>([]);

  useEffect(() => {
    const fetchHabit = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/habits/${habitId}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setHabit(data.habit);
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHabit();
  }, [habitId]);

  const handleCheckIn = async () => {
    const today = new Date().toISOString().split("T")[0];
    const body: Record<string, unknown> = { check_date: today };
    if (checkInNote) body.note = checkInNote;
    if (checkInMood) body.mood = checkInMood;

    const res = await fetch(`/api/habits/${habitId}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setCheckInNote("");
      setCheckInMood("");
      // Refresh
      const data = await (await fetch(`/api/habits/${habitId}`)).json();
      setHabit(data.habit);
      onHabitUpdated?.();
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    const res = await fetch(`/api/habits/${habitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const data = await (await fetch(`/api/habits/${habitId}`)).json();
      setHabit(data.habit);
      onHabitUpdated?.();
    }
  };

  const openGoalPicker = async () => {
    setShowGoalPicker(true);
    setPickerLoading(true);
    setSelectedGoalsToAdd([]);
    try {
      const res = await fetch("/api/goals?status=active&include_progress=false");
      if (res.ok) {
        const data = await res.json();
        const linkedIds = new Set((habit?.linked_goals || []).map((g) => g.id));
        const available = (data.goals || []).filter((g: AvailableGoal) => !linkedIds.has(g.id));
        setAvailableGoals(available);
      }
    } catch (err) {
      console.error("Error fetching goals:", err);
    } finally {
      setPickerLoading(false);
    }
  };

  const handleAddGoals = async () => {
    if (!habit || selectedGoalsToAdd.length === 0) return;
    try {
      const currentGoalIds = (habit.linked_goals || []).map((g) => g.id);
      const allGoalIds = [...currentGoalIds, ...selectedGoalsToAdd];
      const res = await fetch(`/api/habits/${habitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal_ids: allGoalIds }),
      });
      if (res.ok) {
        const data = await (await fetch(`/api/habits/${habitId}`)).json();
        setHabit(data.habit);
        setShowGoalPicker(false);
        setSelectedGoalsToAdd([]);
        onHabitUpdated?.();
      }
    } catch (err) {
      console.error("Error adding goals:", err);
    }
  };

  const toggleGoalToAdd = (goalId: string) => {
    setSelectedGoalsToAdd((prev) =>
      prev.includes(goalId) ? prev.filter((id) => id !== goalId) : [...prev, goalId]
    );
  };

  if (loading) return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>;
  if (!habit) return <div className="p-6 text-center text-slate-400">Habit not found</div>;

  // Build last 7 days grid
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split("T")[0];
  });

  const checkInDates = new Set((habit.check_in_history || []).map((c) => c.check_date));

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {habit.category && (
              <span className="text-xs text-slate-400">{habit.category.icon} {habit.category.name}</span>
            )}
            {habit.frequency && (
              <span className="text-xs text-slate-500">{habit.frequency.name}</span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <h2 className="text-xl font-bold text-slate-100 mt-2">{habit.title}</h2>
      </div>

      <div className="p-6 space-y-6">
        {/* Streak stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-amber-400">🔥 {habit.current_streak}</div>
            <div className="text-xs text-slate-400 mt-1">Current</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-slate-100">{habit.longest_streak}</div>
            <div className="text-xs text-slate-400 mt-1">Best</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-slate-100">{habit.total_completions}</div>
            <div className="text-xs text-slate-400 mt-1">Total</div>
          </div>
        </div>

        {/* Last 7 days */}
        <div>
          <h3 className="text-sm font-semibold text-slate-100 mb-3">Last 7 Days</h3>
          <div className="flex items-center justify-between gap-1">
            {last7Days.map((date) => {
              const done = checkInDates.has(date);
              const dayName = DAY_NAMES[new Date(date + "T00:00:00").getDay()];
              const isToday = date === new Date().toISOString().split("T")[0];
              return (
                <div key={date} className="flex flex-col items-center gap-1">
                  <span className={`text-xs ${isToday ? "text-green-400 font-bold" : "text-slate-500"}`}>
                    {dayName}
                  </span>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    done ? "bg-green-400/20 border-2 border-green-400" : "bg-slate-800 border-2 border-slate-700"
                  }`}>
                    {done && (
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Check-in form (if not checked today) */}
        {habit.status === "active" && !habit.checked_today && (
          <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-100">Check In</h3>
            {/* Mood picker */}
            <div className="flex items-center gap-2">
              {Object.entries(MOOD_EMOJI).map(([mood, emoji]) => (
                <button
                  key={mood}
                  onClick={() => setCheckInMood(checkInMood === mood ? "" : mood)}
                  className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                    checkInMood === mood ? "bg-slate-700 ring-2 ring-green-400" : "bg-slate-800 hover:bg-slate-700"
                  }`}
                  title={mood}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {/* Note */}
            <input
              type="text"
              value={checkInNote}
              onChange={(e) => setCheckInNote(e.target.value)}
              placeholder="Quick note (optional)..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400/50 text-sm"
            />
            <button
              onClick={handleCheckIn}
              className="w-full px-4 py-2.5 bg-green-400 hover:bg-green-500 text-slate-950 font-semibold rounded-lg transition-colors"
            >
              Complete Today
            </button>
          </div>
        )}

        {habit.checked_today && (
          <div className="bg-green-400/10 border border-green-400/30 rounded-lg p-4 text-center">
            <span className="text-green-400 font-medium">Done for today! Keep it up.</span>
          </div>
        )}

        {/* Description */}
        {habit.description && (
          <p className="text-slate-300 text-sm leading-relaxed">{habit.description}</p>
        )}

        {/* Linked Goals */}
        {(habit.linked_goals && habit.linked_goals.length > 0) || showGoalPicker ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-100">
                {habit.linked_goals && habit.linked_goals.length > 0 ? (
                  <>
                    Linked Goals <span className="text-slate-400">This habit drives {habit.linked_goals.length} {habit.linked_goals.length === 1 ? "goal" : "goals"}</span>
                  </>
                ) : (
                  "Linked Goals"
                )}
              </h3>
            </div>
            {showGoalPicker && (
              <div className="bg-slate-800/50 rounded-lg p-4 mb-3 space-y-3">
                {pickerLoading ? (
                  <p className="text-sm text-slate-400">Loading goals...</p>
                ) : availableGoals.length > 0 ? (
                  <>
                    <div className="space-y-2">
                      {availableGoals.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleGoalToAdd(g.id)}
                          className={`w-full p-2 rounded-lg border text-left transition-colors text-sm ${
                            selectedGoalsToAdd.includes(g.id)
                              ? "border-green-400 bg-green-400/10"
                              : "border-slate-700 bg-slate-800 hover:border-slate-600"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedGoalsToAdd.includes(g.id)}
                              onChange={() => {}}
                              className="rounded accent-green-400"
                            />
                            <span className={selectedGoalsToAdd.includes(g.id) ? "text-green-400 font-medium" : "text-slate-100 flex-1"}>
                              {g.title}
                            </span>
                            <span className="text-xs text-green-400 ml-auto">{Math.round(g.progress_value)}%</span>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowGoalPicker(false)}
                        className="flex-1 px-3 py-2 text-slate-400 hover:text-slate-100 transition-colors text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddGoals}
                        disabled={selectedGoalsToAdd.length === 0}
                        className="flex-1 px-3 py-2 bg-green-400 hover:bg-green-500 text-slate-950 font-medium rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add ({selectedGoalsToAdd.length})
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-400">No more goals available to link</p>
                    <button
                      onClick={() => setShowGoalPicker(false)}
                      className="w-full px-3 py-2 text-slate-400 hover:text-slate-100 transition-colors text-sm font-medium"
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            )}
            {habit.linked_goals && habit.linked_goals.length > 0 && (
              <div className="space-y-2">
                {habit.linked_goals.map((g) => (
                  <div key={g.id} className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-100">{g.title}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        g.status === "completed" ? "bg-blue-400/10 text-blue-400" :
                        g.status === "active" ? "bg-green-400/10 text-green-400" :
                        g.status === "paused" ? "bg-amber-400/10 text-amber-400" :
                        "bg-slate-400/10 text-slate-400"
                      }`}>
                        {g.status}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-green-400 h-2 rounded-full transition-all"
                        style={{ width: `${Math.round(g.progress_value)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-400">{Math.round(g.progress_value)}% complete</div>
                  </div>
                ))}
                {!showGoalPicker && (
                  <button
                    onClick={openGoalPicker}
                    className="w-full px-3 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium rounded-lg transition-colors text-sm"
                  >
                    Link to More Goals
                  </button>
                )}
              </div>
            )}
            {(!habit.linked_goals || habit.linked_goals.length === 0) && !showGoalPicker && (
              <button
                onClick={openGoalPicker}
                className="w-full px-4 py-2.5 bg-green-400 hover:bg-green-500 text-slate-950 font-medium rounded-lg transition-colors text-sm"
              >
                Link to Goal
              </button>
            )}
          </div>
        ) : null}

        {/* Status actions */}
        {habit.status === "active" && (
          <div className="flex items-center gap-2 pt-4 border-t border-slate-800">
            <button
              onClick={() => handleStatusChange("paused")}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors text-sm"
            >
              Pause
            </button>
            <button
              onClick={() => handleStatusChange("retired")}
              className="px-4 py-2 text-slate-500 hover:text-red-400 font-medium rounded-lg transition-colors text-sm"
            >
              Retire
            </button>
          </div>
        )}
        {habit.status === "paused" && (
          <div className="pt-4 border-t border-slate-800">
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
            <CommentThread entityType="habit" entityId={habitId} />
          </div>
        </div>

        {/* Recent check-ins */}
        {habit.check_in_history && habit.check_in_history.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Recent Check-ins</h3>
            <div className="space-y-1.5">
              {habit.check_in_history.slice(0, 10).map((c) => (
                <div key={c.id} className="flex items-center gap-3 text-sm py-1.5">
                  <span className="text-slate-500 text-xs w-20 flex-shrink-0">
                    {new Date(c.check_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  {c.mood && <span>{MOOD_EMOJI[c.mood] || ""}</span>}
                  {c.note && <span className="text-slate-400 truncate">{c.note}</span>}
                  {!c.mood && !c.note && <span className="text-slate-600">—</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
