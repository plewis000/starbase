"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";

interface ConfigItem {
  id: string;
  name: string;
  slug?: string;
  icon?: string;
}

interface Goal {
  id: string;
  title: string;
  progress_type: string;
  progress_value: number;
}

interface HabitFormProps {
  onSave: (habit: Record<string, unknown>) => void;
  onCancel: () => void;
}

const DAY_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export default function HabitForm({ onSave, onCancel }: HabitFormProps) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [frequencyId, setFrequencyId] = useState("");
  const [targetCount, setTargetCount] = useState("1");
  const [specificDays, setSpecificDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);

  const [frequencies, setFrequencies] = useState<ConfigItem[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = await res.json();
          setFrequencies(data.habit_frequencies || []);
          // Default to first frequency
          if (data.habit_frequencies?.length > 0 && !frequencyId) {
            setFrequencyId(data.habit_frequencies[0].id);
          }
        }
      } catch {
        toast.error("Failed to load frequencies");
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    const fetchGoals = async () => {
      try {
        const res = await fetch("/api/goals?status=active&include_progress=false");
        if (res.ok) {
          const data = await res.json();
          setGoals(data.goals || []);
        }
      } catch {
        toast.error("Failed to load goals");
      }
    };
    fetchGoals();
  }, []);

  const toggleDay = (day: number) => {
    setSpecificDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const toggleGoal = (goalId: string) => {
    setSelectedGoalIds((prev) =>
      prev.includes(goalId) ? prev.filter((id) => id !== goalId) : [...prev, goalId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    if (!frequencyId) { setError("Frequency is required"); return; }

    setSaving(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        frequency_id: frequencyId,
        target_count: parseInt(targetCount) || 1,
      };
      if (specificDays.length > 0) body.specific_days = specificDays;
      if (selectedGoalIds.length > 0) body.goal_ids = selectedGoalIds;

      const res = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create habit");
      }

      const data = await res.json();
      onSave(data.habit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create habit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 bg-red-400/10 border border-red-400/30 rounded-lg text-red-400 text-sm">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">What habit do you want to build? *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Read for 30 minutes"
          className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400/50"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why is this habit important?"
          rows={2}
          className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400/50 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Frequency *</label>
          <select
            value={frequencyId}
            onChange={(e) => setFrequencyId(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-green-400/50"
          >
            <option value="">Select...</option>
            {frequencies.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Times per period</label>
          <input
            type="number"
            min="1"
            max="30"
            value={targetCount}
            onChange={(e) => setTargetCount(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-green-400/50"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Specific days (optional)</label>
        <div className="flex items-center gap-2">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              className={`w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                specificDays.includes(d.value)
                  ? "bg-green-400 text-slate-950"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Link to goals */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Link to Goal (optional)</label>
        <p className="text-xs text-slate-400 mb-3">Select active goals this habit will help you achieve</p>
        {goals.length > 0 ? (
          <div className="space-y-2">
            {goals.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleGoal(g.id)}
                className={`w-full p-3 rounded-lg border text-left transition-colors ${
                  selectedGoalIds.includes(g.id)
                    ? "border-green-400 bg-green-400/10"
                    : "border-slate-700 bg-slate-800 hover:border-slate-600"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedGoalIds.includes(g.id)}
                    onChange={() => {}}
                    className="rounded accent-green-400"
                  />
                  <div className="flex-1">
                    <span className={`text-sm font-medium ${selectedGoalIds.includes(g.id) ? "text-green-400" : "text-slate-100"}`}>
                      {g.title}
                    </span>
                    <span className="block text-xs text-slate-400 mt-0.5">{g.progress_type.replace("_", " ")} • {Math.round(g.progress_value)}%</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 p-3 bg-slate-800 rounded-lg">No active goals available. Create a goal first.</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-slate-400 hover:text-slate-100 transition-colors font-medium">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !title.trim() || !frequencyId}
          className="px-6 py-2 bg-green-400 hover:bg-green-500 text-slate-950 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Creating..." : "Create Habit"}
        </button>
      </div>
    </form>
  );
}
