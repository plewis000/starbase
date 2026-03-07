"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import PageHeader from "@/components/ui/PageHeader";

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  progress_value: number;
  target_date: string | null;
}

interface PartyGoal {
  id: string;
  party_xp_bonus: number;
  goal: Goal;
}

export default function PartyGoalsPage() {
  const toast = useToast();
  const [partyGoals, setPartyGoals] = useState<PartyGoal[]>([]);
  const [availableGoals, setAvailableGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [pgRes, goalsRes] = await Promise.all([
        fetch("/api/gamification/party-goals"),
        fetch("/api/goals"),
      ]);

      if (pgRes.ok) {
        const data = await pgRes.json();
        setPartyGoals(data.partyGoals || []);
      }

      if (goalsRes.ok) {
        const data = await goalsRes.json();
        setAvailableGoals(data.goals || []);
      }
    } catch {
      toast.error("Failed to load party goals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const partyGoalIds = new Set(partyGoals.map((pg) => pg.goal?.id));
  const unlinkedGoals = availableGoals.filter((g) => !partyGoalIds.has(g.id) && g.status !== "completed");

  const handleAdd = async (goalId: string) => {
    setAdding(goalId);
    try {
      const res = await fetch("/api/gamification/party-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal_id: goalId, party_xp_bonus: 100 }),
      });
      if (!res.ok) throw new Error("Failed to add");
      toast.success("Goal marked as party quest! 1.5x XP for team completion.");
      setShowPicker(false);
      fetchData();
    } catch {
      toast.error("Failed to add party goal");
    } finally {
      setAdding(null);
    }
  };

  const handleRemove = async (goalId: string) => {
    try {
      const res = await fetch(`/api/gamification/party-goals?goal_id=${goalId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      toast.success("Party status removed");
      setPartyGoals((prev) => prev.filter((pg) => pg.goal?.id !== goalId));
    } catch {
      toast.error("Failed to remove party goal");
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-dungeon-500 font-mono">Loading party quests...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Party Quests"
        subtitle="Shared goals for the household. Complete together for bonus XP. The System respects cooperation. Barely."
        breadcrumbs={[
          { label: "The Crawl", href: "/crawl" },
          { label: "Party Quests" },
        ]}
        action={
          <button
            onClick={() => setShowPicker(true)}
            disabled={unlinkedGoals.length === 0}
            className="dcc-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Quest
          </button>
        }
      />

      {/* Goal Picker */}
      {showPicker && (
        <div className="dcc-card p-5 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-slate-100 dcc-heading">Select a Goal</h3>
            <button
              onClick={() => setShowPicker(false)}
              className="text-dungeon-500 hover:text-slate-100 transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
          {unlinkedGoals.length === 0 ? (
            <p className="text-dungeon-500 text-sm font-mono">All your goals are already party quests or completed.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {unlinkedGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="flex items-center justify-between p-3 bg-dungeon-800 border border-dungeon-700 rounded-lg"
                >
                  <div>
                    <div className="text-sm text-slate-100 font-medium">{goal.title}</div>
                    {goal.description && (
                      <div className="text-xs text-dungeon-500 mt-0.5 line-clamp-1">{goal.description}</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleAdd(goal.id)}
                    disabled={adding === goal.id}
                    className="dcc-btn-primary text-xs disabled:opacity-50"
                  >
                    {adding === goal.id ? "Adding..." : "Make Party Quest"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Party Goals List */}
      {partyGoals.length === 0 ? (
        <div className="dcc-card p-8 text-center">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-dungeon-500 mb-1">No party quests active.</p>
          <p className="text-dungeon-500 text-sm font-mono">
            Party quests are shared goals that both crawlers work toward together.
            Complete them as a team for 1.5x XP bonus.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {partyGoals.map((pg) => {
            const goal = pg.goal;
            if (!goal) return null;
            const progress = goal.progress_value || 0;
            return (
              <div
                key={pg.id}
                className="dcc-card p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">👥</span>
                    <div>
                      <h3 className="text-slate-100 font-semibold">{goal.title}</h3>
                      {goal.description && (
                        <p className="text-xs text-dungeon-500 mt-0.5 line-clamp-2">{goal.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="dcc-badge-gold text-xs">
                      +{pg.party_xp_bonus} XP bonus
                    </span>
                    <button
                      onClick={() => handleRemove(goal.id)}
                      className="text-dungeon-500 hover:text-crimson-400 transition-colors p-1"
                      title="Remove party status"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="dcc-xp-bar h-2.5 mb-1">
                  <div
                    className="dcc-xp-fill h-2.5"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-dungeon-500 font-mono">
                  <span>{progress}% complete</span>
                  {goal.target_date && (
                    <span>Due {new Date(goal.target_date).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info */}
      <div className="dcc-card p-4 text-xs text-dungeon-500 font-mono">
        <strong className="text-slate-300">How party quests work:</strong> Mark any goal as a party quest.
        When the goal is completed, every crawler in the household earns the bonus XP. The System tracks
        completion and awards bonuses automatically. Teamwork is a survival strategy, not a feel-good exercise.
      </div>
    </div>
  );
}
