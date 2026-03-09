"use client";

import React, { useState, useEffect, useCallback } from "react";
import HabitCard from "./HabitCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import CompletionCelebration from "@/components/ui/CompletionCelebration";
import { useToast } from "@/components/ui/Toast";

interface Habit {
  id: string;
  title: string;
  completed_at?: string | null;
  streak_current: number;
  streak_longest: number;
  total_completions: number;
  checked_today?: boolean;
  frequency_name?: string | null;
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
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, is_habit: true, recurrence_rule: "FREQ=DAILY", recurrence_mode: "flexible" }),
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
      placeholder="Quick add habit... (e.g., 'drink water', 'exercise')"
      disabled={adding}
      className="w-full bg-dungeon-900 border border-dungeon-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-dungeon-500 focus:outline-none focus:border-red-500/50 disabled:opacity-50 transition-colors"
    />
  );
}

const HABIT_SUGGESTIONS = [
  { title: "Drink 8 glasses of water", icon: "💧" },
  { title: "Exercise for 30 minutes", icon: "🏋️" },
  { title: "Read for 15 minutes", icon: "📖" },
  { title: "Take a walk outside", icon: "🚶" },
  { title: "Tidy up for 10 minutes", icon: "🧹" },
  { title: "Meditate for 5 minutes", icon: "🧘" },
  { title: "No phone before bed", icon: "📱" },
  { title: "Cook a meal at home", icon: "🍳" },
];

function HabitSuggestions({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const [creating, setCreating] = useState<string | null>(null);

  const handleCreate = async (title: string) => {
    setCreating(title);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, is_habit: true, recurrence_rule: "FREQ=DAILY", recurrence_mode: "flexible" }),
      });
      if (res.ok) { onCreated(); toast.success(`Added "${title}"`); }
      else { toast.error("Failed to create habit"); }
    } catch { toast.error("Failed to create habit"); }
    setCreating(null);
  };

  return (
    <div className="bg-dungeon-850 border border-dungeon-700 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">Quick start — tap to add</h3>
      <div className="flex flex-wrap gap-2">
        {HABIT_SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => handleCreate(s.title)}
            disabled={creating === s.title}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-dungeon-900 border border-dungeon-700 text-dungeon-400 hover:text-slate-200 hover:border-crimson-700 disabled:opacity-50 transition-all"
          >
            <span>{s.icon}</span>
            {s.title}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function HabitList({ onSelectHabit, onCreateHabit, selectedHabitId }: HabitListProps) {
  const toast = useToast();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("active");
  const [showCelebration, setShowCelebration] = useState(false);

  const fetchHabits = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("is_habit", "true");
      if (filter === "active") params.append("hide_done_days", "-1");
      params.append("limit", "100");

      const res = await fetch(`/api/tasks?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setHabits(data.tasks || []);
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
      await fetch(`/api/tasks/${habitId}/completions?date=${today}`, { method: "DELETE" });
      toast.success("Check-in removed");
    } else {
      // Create check-in
      const res = await fetch(`/api/tasks/${habitId}/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed_date: today }),
      });
      // Trigger completion sync for linked entities (fire-and-forget)
      fetch("/api/entity-links/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "habit", entity_id: habitId }),
      }).catch(() => {});

      // Calculate XP for toast (mirrors server formula)
      const newStreak = res.ok ? ((await res.json()).streak?.current_streak ?? (habit.streak_current || 0) + 1) : (habit.streak_current || 0) + 1;
      let xp = 15;
      if (newStreak >= 90) xp += 50;
      else if (newStreak >= 30) xp += 25;
      else if (newStreak >= 7) xp += 10;

      // Check if all habits are now done → celebrate
      const willBeAllDone = habits.filter((h) => !h.completed_at).every(
        (h) => h.checked_today || h.id === habitId
      );
      if (willBeAllDone && activeCount > 0) {
        setShowCelebration(true);
        toast.success("All habits done today! ⚡");
      } else if (newStreak === 7) {
        toast.success(`${habit.title} — 7-day streak! +${xp} XP`);
      } else if (newStreak === 30) {
        toast.success(`${habit.title} — 30-day streak! +${xp} XP`);
      } else if (newStreak === 90) {
        toast.success(`${habit.title} — 90-day streak! +${xp} XP`);
      } else {
        toast.success(`${habit.title} +${xp} XP`);
      }
    }
    fetchHabits();
  };

  const checkedCount = habits.filter((h) => h.checked_today).length;
  const activeCount = habits.filter((h) => !h.completed_at).length;
  const completionRate = activeCount > 0 ? Math.round((checkedCount / activeCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <CompletionCelebration
        show={showCelebration}
        onComplete={() => setShowCelebration(false)}
      />
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Habits</h1>
          <p className="text-sm text-dungeon-400 mt-1">
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
        <div className="bg-dungeon-900 rounded-lg p-4 border border-dungeon-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-100">
              {completionRate === 100 ? "All done today!" : completionRate >= 50 ? "Keep it up!" : "Today\u2019s Progress"}
            </span>
            <span className={`text-sm font-bold ${completionRate === 100 ? "text-emerald-400" : "text-red-400"}`}>{completionRate}%</span>
          </div>
          <div className="w-full bg-dungeon-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${completionRate === 100 ? "bg-emerald-400" : "bg-red-400"}`}
              style={{ width: `${completionRate}%` }}
            />
          </div>
          <p className="text-xs text-dungeon-500 mt-2">
            {checkedCount === 0 ? "Start your day — check in on your first habit" :
             completionRate === 100 ? `${activeCount} habits done. You\u2019re on fire!` :
             `${activeCount - checkedCount} habit${activeCount - checkedCount > 1 ? "s" : ""} remaining today`}
          </p>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-1 bg-dungeon-900 p-1 rounded-lg border border-dungeon-800">
        {(["active", "paused", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
              filter === f ? "bg-dungeon-800 text-red-400" : "text-dungeon-400 hover:text-slate-100"
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
        <div className="space-y-6">
          <EmptyState
            icon="🔄"
            title="Start building your routine"
            description="Track daily habits like 'drink water', 'exercise', or 'read for 15 minutes'. Small habits compound into big changes — start with just one."
            tip="Tip: Use habits for things you do regularly (daily/weekly). Use tasks for one-time to-dos with a due date."
            action={{ label: "Create Your First Habit", onClick: onCreateHabit }}
          />
          <HabitSuggestions onCreated={fetchHabits} />
        </div>
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
