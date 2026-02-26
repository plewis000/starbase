"use client";

import React, { useState, useEffect, useCallback } from "react";
import GoalCard from "./GoalCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";

interface Goal {
  id: string;
  title: string;
  status: string;
  progress_type: string;
  progress_value: number;
  target_date?: string;
  category?: { name: string; icon?: string } | null;
  milestones?: { id: string; completed_at?: string }[];
}

interface GoalListProps {
  onSelectGoal: (id: string) => void;
  onCreateGoal: () => void;
  selectedGoalId?: string;
}

const STATUS_TABS = ["All", "Active", "Completed", "Paused"] as const;

export default function GoalList({ onSelectGoal, onCreateGoal, selectedGoalId }: GoalListProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("Active");
  const [search, setSearch] = useState("");

  const fetchGoals = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeTab !== "All") params.append("status", activeTab.toLowerCase());
      if (search) params.append("search", search);
      params.append("limit", "100");

      const res = await fetch(`/api/goals?${params}`);
      if (!res.ok) throw new Error("Failed to fetch goals");
      const data = await res.json();
      setGoals(data.goals || []);
    } catch (err) {
      console.error("Error fetching goals:", err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // Stats
  const activeCount = goals.filter((g) => g.status === "active").length;
  const avgProgress = goals.length > 0
    ? Math.round(goals.reduce((sum, g) => sum + g.progress_value, 0) / goals.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Goals</h1>
          <p className="text-sm text-slate-400 mt-1">
            {goals.length === 0 ? "No goals yet" : `${activeCount} active · ${avgProgress}% avg progress`}
          </p>
        </div>
        <button
          onClick={onCreateGoal}
          className="px-4 py-2 bg-green-400 hover:bg-green-500 text-slate-950 font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Goal
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-slate-800 text-green-400"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search goals..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400/50 transition-colors"
        />
      </div>

      {/* Goals list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : goals.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="No goals found"
          description="Set a goal to track your progress toward something meaningful."
          action={{ label: "New Goal", onClick: onCreateGoal }}
        />
      ) : (
        <div className="space-y-2">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onSelect={onSelectGoal}
              isSelected={selectedGoalId === goal.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
