"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";

interface ConfigItem {
  id: string;
  name: string;
  slug?: string;
  icon?: string;
}

interface Habit {
  id: string;
  title: string;
  status: string;
  current_streak: number;
}

interface GoalFormProps {
  onSave: (goal: Record<string, unknown>) => void;
  onCancel: () => void;
}

export default function GoalForm({ onSave, onCancel }: GoalFormProps) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [timeframeId, setTimeframeId] = useState("");
  const [progressType, setProgressType] = useState("manual");
  const [targetDate, setTargetDate] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");
  const [milestones, setMilestones] = useState<{ title: string; target_date?: string }[]>([]);
  const [newMilestone, setNewMilestone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedHabitIds, setSelectedHabitIds] = useState<string[]>([]);

  const [categories, setCategories] = useState<ConfigItem[]>([]);
  const [timeframes, setTimeframes] = useState<ConfigItem[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);

  // Fetch config and habits
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = await res.json();
          setCategories(data.goal_categories || []);
          setTimeframes(data.goal_timeframes || []);
        }
      } catch {
        toast.error("Failed to load goal options");
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    const fetchHabits = async () => {
      try {
        const res = await fetch("/api/habits?status=active");
        if (res.ok) {
          const data = await res.json();
          setHabits(data.habits || []);
        }
      } catch {
        toast.error("Failed to load habits");
      }
    };
    if (progressType === "habit_driven") {
      fetchHabits();
    }
  }, [progressType]);

  const addMilestone = () => {
    if (newMilestone.trim()) {
      setMilestones([...milestones, { title: newMilestone.trim() }]);
      setNewMilestone("");
    }
  };

  const removeMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const toggleHabit = (habitId: string) => {
    setSelectedHabitIds((prev) =>
      prev.includes(habitId) ? prev.filter((id) => id !== habitId) : [...prev, habitId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        category_id: categoryId || undefined,
        timeframe_id: timeframeId || undefined,
        progress_type: progressType,
        target_date: targetDate || undefined,
        start_date: new Date().toISOString().split("T")[0],
      };

      if (targetValue) body.target_value = parseFloat(targetValue);
      if (unit) body.unit = unit;
      if (milestones.length > 0) body.milestones = milestones;
      if (selectedHabitIds.length > 0) body.habit_ids = selectedHabitIds;

      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create goal");
      }

      const data = await res.json();
      onSave(data.goal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 bg-red-400/10 border border-red-400/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you want to achieve?"
          className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400/50"
          autoFocus
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why does this goal matter?"
          rows={3}
          className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400/50 resize-none"
        />
      </div>

      {/* Category + Timeframe row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Category</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-red-400/50"
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Timeframe</label>
          <select
            value={timeframeId}
            onChange={(e) => setTimeframeId(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-red-400/50"
          >
            <option value="">None</option>
            {timeframes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Progress type */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Track progress by</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "manual", label: "Manual %", desc: "Slide to update" },
            { value: "milestone", label: "Milestones", desc: "Check off steps" },
            { value: "habit_driven", label: "Habits", desc: "Linked habit streaks" },
            { value: "task_driven", label: "Tasks", desc: "Linked task completion" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setProgressType(opt.value)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                progressType === opt.value
                  ? "border-red-400 bg-red-400/10"
                  : "border-slate-700 bg-slate-800 hover:border-slate-600"
              }`}
            >
              <span className={`text-sm font-medium ${progressType === opt.value ? "text-red-400" : "text-slate-100"}`}>
                {opt.label}
              </span>
              <span className="block text-xs text-slate-400 mt-0.5">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Target date */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Target date</label>
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-red-400/50"
        />
      </div>

      {/* Milestones (if milestone type) */}
      {progressType === "milestone" && (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Milestones</label>
          <div className="space-y-2 mb-2">
            {milestones.map((m, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-slate-800 rounded-lg">
                <span className="text-sm text-slate-100 flex-1">{m.title}</span>
                <button
                  type="button"
                  onClick={() => removeMilestone(i)}
                  className="text-slate-500 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newMilestone}
              onChange={(e) => setNewMilestone(e.target.value)}
              placeholder="Add a milestone..."
              className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400/50 text-sm"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMilestone())}
            />
            <button
              type="button"
              onClick={addMilestone}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors text-sm"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Manual target value */}
      {progressType === "manual" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Target value</label>
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="100"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Unit</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g., books, lbs, miles"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400/50"
            />
          </div>
        </div>
      )}

      {/* Habit-driven: Link habits */}
      {progressType === "habit_driven" && (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Link Habits (optional)</label>
          <p className="text-xs text-slate-400 mb-3">Select active habits to drive this goal's progress</p>
          {habits.length > 0 ? (
            <div className="space-y-2">
              {habits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => toggleHabit(h.id)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    selectedHabitIds.includes(h.id)
                      ? "border-red-400 bg-red-400/10"
                      : "border-slate-700 bg-slate-800 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedHabitIds.includes(h.id)}
                      onChange={() => {}}
                      className="rounded accent-red-400"
                    />
                    <div className="flex-1">
                      <span className={`text-sm font-medium ${selectedHabitIds.includes(h.id) ? "text-red-400" : "text-slate-100"}`}>
                        {h.title}
                      </span>
                      <span className="block text-xs text-slate-400 mt-0.5">🔥 {h.current_streak}d streak</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 p-3 bg-slate-800 rounded-lg">No active habits available. Create a habit first.</p>
          )}
        </div>
      )}

      {/* Task-driven: Info */}
      {progressType === "task_driven" && (
        <div className="p-3 bg-blue-400/10 border border-blue-400/30 rounded-lg">
          <p className="text-sm text-blue-400">Tasks can be linked and managed after creating the goal.</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-slate-400 hover:text-slate-100 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="px-6 py-2 bg-red-400 hover:bg-red-500 text-slate-950 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Creating..." : "Create Goal"}
        </button>
      </div>
    </form>
  );
}
