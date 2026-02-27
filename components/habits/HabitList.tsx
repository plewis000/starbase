"use client";

import React, { useState, useEffect, useCallback } from "react";
import HabitCard from "./HabitCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

interface Habit {
  id: string;
  title: string;
  status: string;
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  checked_today?: boolean;
  frequency?: { name: string } | null;
  category?: { name: string; icon?: string } | null;
}

interface HabitListProps {
  onSelectHabit: (id: string) => void;
  onCreateHabit: () => void;
  selectedHabitId?: string;
}

function QuickAddHabit({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const handleAdd = async () => {
    const t = title.trim();
    if (!t || adding) return;
    setAdding(true);
    try {
      const configRes = await fetch("/api/config");
      const configData = await configRes.json();
      const dailyFreq = configData.habit_frequencies?.find((f: { name: string }) => f.name.toLowerCase() === "daily");

      const res = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, frequency_id: dailyFreq?.id }),
      });
      if (res.ok) { setTitle(""); onCreated(); toast.success("Habit created"); }
      else { toast.error("Failed to create habit"); }
    } catch { toast.error("Failed to create habit"); }
    setAdding(false);
  };

  return (
    <input
      type="text"
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
      placeholder="Quick add habit... (press Enter, defaults to daily)"
      disabled={adding}
      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500/50 disabled:opacity-50 transition-colors"
    />
  );
}

export default function HabitList({ onSelectHabit, onCreateHabit, selectedHabitId }: HabitListProps) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("active");

  const fetchHabits = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== "all") params.append("status", filter);
      params.append("limit", "100");

      const res = await fetch(`/api/habits?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setHabits(data.habits || []);
    } catch {
      // Silently fail on fetch — empty state will show
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  const handleQuickCheckIn = async (habitId: string) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;

    const today = new Date().toISOString().split("T")[0];

    if (habit.checked_today) {
      // Undo check-in
      await fetch(`/api/habits/${habitId}/check-in?date=${today}`, { method: "DELETE" });
    } else {
      // Create check-in
      await fetch(`/api/habits/${habitId}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check_date: today }),
      });
    }
    fetchHabits();
  };

  const checkedCount = habits.filter((h) => h.checked_today).length;
  const activeCount = habits.filter((h) => h.status === "active").length;
  const completionRate = activeCount > 0 ? Math.round((checkedCount / activeCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Habits</h1>
          <p className="text-sm text-slate-400 mt-1">
            {activeCount === 0
              ? "No habits yet"
              : `${checkedCount}/${activeCount} done today · ${completionRate}%`}
          </p>
        </div>
        <button
          onClick={onCreateHabit}
          className="px-4 py-2 bg-red-400 hover:bg-red-500 text-slate-950 font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Habit
        </button>
      </div>

      {/* Quick-add habit */}
      <QuickAddHabit onCreated={fetchHabits} />

      {/* Today's progress bar */}
      {activeCount > 0 && (
        <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-100">Today&apos;s Progress</span>
            <span className="text-sm text-red-400 font-bold">{completionRate}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2">
            <div
              className="bg-red-400 h-2 rounded-full transition-all"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
        {(["active", "paused", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
              filter === f ? "bg-slate-800 text-red-400" : "text-slate-400 hover:text-slate-100"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : habits.length === 0 ? (
        <EmptyState
          icon="🔄"
          title="No habits found"
          description="Build consistency by tracking your daily habits."
          action={{ label: "New Habit", onClick: onCreateHabit }}
        />
      ) : (
        <div className="space-y-2">
          {habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              onSelect={onSelectHabit}
              onCheckIn={handleQuickCheckIn}
              isSelected={selectedHabitId === habit.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
