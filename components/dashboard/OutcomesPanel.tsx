"use client";

import { useEffect, useState } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface DashboardGoal {
  id: string;
  title: string;
  progress_value: number;
  status: string;
  target_date?: string;
  linked_habit_ids: string[];
}

interface DashboardHabit {
  id: string;
  title: string;
  current_streak: number;
  checked_today: boolean;
  linked_goal_ids: string[];
}

interface DashboardData {
  tasks_summary: { overdue: number; due_today: number; active: number };
  goals_summary: { active_count: number; avg_progress: number; goals: DashboardGoal[] };
  habits_summary: { active_count: number; checked_today: number; habits: DashboardHabit[] };
  streaks_leaderboard: { title: string; current_streak: number }[];
}

export default function OutcomesPanel() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/dashboard");
        if (!res.ok) throw new Error("Failed to fetch dashboard");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Error fetching dashboard:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 text-center text-slate-400">
        Failed to load dashboard data
      </div>
    );
  }

  const { goals_summary, habits_summary, tasks_summary, streaks_leaderboard } = data;
  const goals = goals_summary.goals || [];
  const habits = habits_summary.habits || [];

  // Build habit lookup by ID
  const habitMap = new Map(habits.map((h) => [h.id, h]));

  // Find standalone habits (not linked to any goal)
  const linkedHabitIds = new Set<string>();
  goals.forEach((g) => g.linked_habit_ids.forEach((id) => linkedHabitIds.add(id)));
  const standaloneHabits = habits.filter((h) => !linkedHabitIds.has(h.id));

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 bg-slate-900 rounded-lg border border-slate-800 px-4 py-2.5">
          <span className="text-green-400 text-lg font-bold">{habits_summary.checked_today}</span>
          <span className="text-slate-400 text-sm">/{habits_summary.active_count} habits today</span>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 rounded-lg border border-slate-800 px-4 py-2.5">
          <span className="text-green-400 text-lg font-bold">{goals_summary.active_count}</span>
          <span className="text-slate-400 text-sm">active goals</span>
        </div>
        {tasks_summary.overdue > 0 && (
          <div className="flex items-center gap-2 bg-red-400/10 rounded-lg border border-red-400/30 px-4 py-2.5">
            <span className="text-red-400 text-lg font-bold">{tasks_summary.overdue}</span>
            <span className="text-red-400/70 text-sm">overdue tasks</span>
          </div>
        )}
        {tasks_summary.due_today > 0 && (
          <div className="flex items-center gap-2 bg-amber-400/10 rounded-lg border border-amber-400/30 px-4 py-2.5">
            <span className="text-amber-400 text-lg font-bold">{tasks_summary.due_today}</span>
            <span className="text-amber-400/70 text-sm">due today</span>
          </div>
        )}
      </div>

      {/* Goals with their driving habits */}
      {goals.length > 0 ? (
        <div className="space-y-3">
          {goals.map((goal) => {
            const goalHabits = goal.linked_habit_ids
              .map((id) => habitMap.get(id))
              .filter(Boolean) as DashboardHabit[];
            const doneCount = goalHabits.filter((h) => h.checked_today).length;

            return (
              <div key={goal.id} className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                {/* Goal header + progress */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-100">{goal.title}</h3>
                  <span className="text-xs text-slate-400 font-medium">
                    {Math.round(goal.progress_value)}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 mb-3">
                  <div
                    className="bg-green-400 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, goal.progress_value)}%` }}
                  />
                </div>

                {/* Driving habits */}
                {goalHabits.length > 0 && (
                  <div className="space-y-1.5 pt-3 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-500 uppercase tracking-wider">Driving Habits</span>
                      <span className="text-xs text-slate-400">
                        {doneCount}/{goalHabits.length} today
                      </span>
                    </div>
                    {goalHabits.map((h) => (
                      <div key={h.id} className="flex items-center gap-2.5 py-1">
                        <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${
                          h.checked_today
                            ? "bg-green-400"
                            : "border-2 border-slate-600"
                        }`} />
                        <span className={`text-sm flex-1 ${h.checked_today ? "text-slate-300" : "text-slate-400"}`}>
                          {h.title}
                        </span>
                        {h.current_streak > 0 && (
                          <span className="text-xs text-amber-400 font-medium">
                            🔥 {h.current_streak}
                          </span>
                        )}
                      </div>
                    ))}
                    {/* Habit health bar */}
                    <div className="w-full bg-slate-800 rounded-full h-1 mt-2">
                      <div
                        className="bg-green-400/60 h-1 rounded-full transition-all"
                        style={{ width: `${goalHabits.length > 0 ? (doneCount / goalHabits.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {goalHabits.length === 0 && (
                  <p className="text-xs text-slate-500 pt-2 border-t border-slate-800">No linked habits</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 text-center">
          <p className="text-slate-400 text-sm">No active goals. Create one to start tracking progress.</p>
        </div>
      )}

      {/* Standalone habits */}
      {standaloneHabits.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Standalone Habits</h3>
          <div className="space-y-1.5">
            {standaloneHabits.map((h) => (
              <div key={h.id} className="flex items-center gap-2.5 py-1">
                <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${
                  h.checked_today ? "bg-green-400" : "border-2 border-slate-600"
                }`} />
                <span className={`text-sm flex-1 ${h.checked_today ? "text-slate-300" : "text-slate-400"}`}>
                  {h.title}
                </span>
                {h.current_streak > 0 && (
                  <span className="text-xs text-amber-400 font-medium">🔥 {h.current_streak}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Streaks leaderboard */}
      {streaks_leaderboard.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Top Streaks</h3>
          <div className="space-y-2">
            {streaks_leaderboard.map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{s.title}</span>
                <span className="text-sm font-bold text-amber-400">🔥 {s.current_streak}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
