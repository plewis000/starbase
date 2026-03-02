"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";

interface Reward {
  id: string;
  tier: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

const TIERS = ["bronze", "silver", "gold", "platinum"] as const;

const TIER_CONFIG: Record<string, { label: string; color: string; border: string; bg: string; icon: string }> = {
  bronze: { label: "Bronze", color: "text-amber-600", border: "border-amber-700/50", bg: "bg-amber-950/30", icon: "🥉" },
  silver: { label: "Silver", color: "text-slate-300", border: "border-slate-500/50", bg: "bg-slate-800/50", icon: "🥈" },
  gold: { label: "Gold", color: "text-amber-400", border: "border-amber-500/50", bg: "bg-amber-900/20", icon: "🥇" },
  platinum: { label: "Platinum", color: "text-purple-300", border: "border-purple-500/50", bg: "bg-purple-900/20", icon: "💎" },
};

export default function RewardsPage() {
  const toast = useToast();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTier, setActiveTier] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", tier: "bronze" });
  const [saving, setSaving] = useState(false);

  const fetchRewards = async () => {
    try {
      const res = await fetch("/api/gamification/rewards");
      if (res.ok) {
        const data = await res.json();
        setRewards(data.rewards || []);
      }
    } catch {
      toast.error("Failed to load rewards");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRewards(); }, []);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Reward name is required");
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? `/api/gamification/rewards?id=${editingId}`
        : "/api/gamification/rewards";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          tier: formData.tier,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      toast.success(editingId ? "Reward updated" : "Reward added to the pool");
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: "", description: "", tier: "bronze" });
      fetchRewards();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/gamification/rewards?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Reward removed");
      setRewards((prev) => prev.filter((r) => r.id !== id));
    } catch {
      toast.error("Failed to delete reward");
    }
  };

  const startEdit = (reward: Reward) => {
    setFormData({ name: reward.name, description: reward.description || "", tier: reward.tier });
    setEditingId(reward.id);
    setShowForm(true);
  };

  const filteredRewards = activeTier === "all"
    ? rewards
    : rewards.filter((r) => r.tier === activeTier);

  const rewardsByTier = TIERS.reduce((acc, tier) => {
    acc[tier] = rewards.filter((r) => r.tier === tier).length;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-slate-400">Loading reward pool...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/crawl" className="text-slate-400 hover:text-slate-100 text-sm transition-colors">
              The Crawl
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-slate-100 text-sm font-medium">Reward Pool</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Loot Box Rewards</h1>
          <p className="text-sm text-slate-400 mt-1">
            Define what you can win. The System doesn&apos;t hand out participation trophies.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setFormData({ name: "", description: "", tier: "bronze" });
          }}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          + Add Reward
        </button>
      </div>

      {/* Tier Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TIERS.map((tier) => {
          const cfg = TIER_CONFIG[tier];
          return (
            <button
              key={tier}
              onClick={() => setActiveTier(activeTier === tier ? "all" : tier)}
              className={`p-3 rounded-lg border transition-all text-left ${
                activeTier === tier
                  ? `${cfg.bg} ${cfg.border} ring-1 ring-offset-0 ring-${tier === "gold" ? "amber" : tier === "platinum" ? "purple" : "slate"}-500/30`
                  : "bg-slate-900 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{cfg.icon}</span>
                <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {rewardsByTier[tier]} reward{rewardsByTier[tier] !== 1 ? "s" : ""}
              </div>
            </button>
          );
        })}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-lg font-semibold text-slate-100">
            {editingId ? "Edit Reward" : "New Reward"}
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-slate-400 block mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Fancy coffee, Movie night, Sleep in..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                maxLength={200}
              />
            </div>

            <div>
              <label className="text-sm text-slate-400 block mb-1">Description (optional)</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Details about this reward..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                maxLength={500}
              />
            </div>

            <div>
              <label className="text-sm text-slate-400 block mb-1">Tier</label>
              <div className="flex gap-2">
                {TIERS.map((tier) => {
                  const cfg = TIER_CONFIG[tier];
                  return (
                    <button
                      key={tier}
                      onClick={() => setFormData({ ...formData, tier })}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        formData.tier === tier
                          ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      {cfg.icon} {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? "Saving..." : editingId ? "Update" : "Add to Pool"}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rewards List */}
      {filteredRewards.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-slate-400">
            {activeTier !== "all"
              ? `No ${TIER_CONFIG[activeTier]?.label} rewards yet.`
              : "Your reward pool is empty. Add rewards to make loot boxes worth opening."}
          </p>
          {rewards.length === 0 && (
            <p className="text-slate-500 text-sm mt-2">
              Start with small wins — a coffee, extra screen time, a nap. Build up to the good stuff.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRewards.map((reward) => {
            const cfg = TIER_CONFIG[reward.tier] || TIER_CONFIG.bronze;
            return (
              <div
                key={reward.id}
                className={`flex items-center justify-between p-4 bg-slate-900 border rounded-lg ${cfg.border}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{cfg.icon}</span>
                  <div>
                    <div className="text-slate-100 font-medium">{reward.name}</div>
                    {reward.description && (
                      <div className="text-xs text-slate-400 mt-0.5">{reward.description}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  <button
                    onClick={() => startEdit(reward)}
                    className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                    title="Edit"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(reward.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1"
                    title="Delete"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4h8v2m1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h10z" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tip */}
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-4 text-xs text-slate-500">
        <strong className="text-slate-400">How it works:</strong> When you unlock a loot box through
        achievements, The System randomly selects a reward from the matching tier. Bronze boxes pick
        from bronze rewards, gold from gold, etc. More rewards = more variety = more fun.
      </div>
    </div>
  );
}
