"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import PageHeader from "@/components/ui/PageHeader";

interface TierInfo {
  slug: string;
  name: string;
  color: string;
  icon: string;
}

interface Reward {
  id: string;
  tier_id: string;
  tier: TierInfo | null;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

interface TierConfig {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

const TIER_SLUGS = ["bronze", "silver", "gold", "platinum", "legendary", "celestial"] as const;

const TIER_DISPLAY: Record<string, { label: string; color: string; border: string; bg: string; icon: string }> = {
  bronze: { label: "Bronze", color: "text-amber-600", border: "border-amber-700/50", bg: "bg-amber-950/30", icon: "🥉" },
  silver: { label: "Silver", color: "text-slate-300", border: "border-slate-500/50", bg: "bg-slate-800/50", icon: "🥈" },
  gold: { label: "Gold", color: "text-amber-400", border: "border-amber-500/50", bg: "bg-amber-900/20", icon: "🥇" },
  platinum: { label: "Platinum", color: "text-purple-300", border: "border-purple-500/50", bg: "bg-purple-900/20", icon: "💎" },
  legendary: { label: "Legendary", color: "text-orange-400", border: "border-orange-600/50", bg: "bg-orange-950/20", icon: "🔥" },
  celestial: { label: "Celestial", color: "text-fuchsia-400", border: "border-fuchsia-600/50", bg: "bg-fuchsia-950/20", icon: "✨" },
};

export default function RewardsPage() {
  const toast = useToast();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTier, setActiveTier] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", tierSlug: "bronze" });
  const [saving, setSaving] = useState(false);

  // Build slug→id map from tiers
  const tierIdMap = new Map(tiers.map((t) => [t.slug, t.id]));

  const fetchRewards = async () => {
    try {
      const res = await fetch("/api/gamification/rewards");
      if (res.ok) {
        const data = await res.json();
        setRewards(data.rewards || []);
        setTiers(data.tiers || []);
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
      const url = "/api/gamification/rewards";
      const method = editingId ? "PATCH" : "POST";

      const tierId = tierIdMap.get(formData.tierSlug);
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          tier_id: tierId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      toast.success(editingId ? "Reward updated" : "Reward added to the pool");
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: "", description: "", tierSlug: "bronze" });
      fetchRewards();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
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
    setFormData({ name: reward.name, description: reward.description || "", tierSlug: reward.tier?.slug || "bronze" });
    setEditingId(reward.id);
    setShowForm(true);
  };

  const filteredRewards = activeTier === "all"
    ? rewards
    : rewards.filter((r) => r.tier?.slug === activeTier);

  const rewardsByTier = TIER_SLUGS.reduce((acc, slug) => {
    acc[slug] = rewards.filter((r) => r.tier?.slug === slug).length;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-dungeon-500 font-mono">Loading reward pool...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Loot Box Rewards"
        subtitle="Define what you can win. The System doesn't hand out participation trophies."
        breadcrumbs={[
          { label: "The Crawl", href: "/crawl" },
          { label: "Reward Pool" },
        ]}
        action={
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setFormData({ name: "", description: "", tierSlug: "bronze" });
            }}
            className="dcc-btn-primary"
          >
            + Add Reward
          </button>
        }
      />

      {/* Tier Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {TIER_SLUGS.map((tier) => {
          const cfg = TIER_DISPLAY[tier];
          return (
            <button
              key={tier}
              onClick={() => setActiveTier(activeTier === tier ? "all" : tier)}
              className={`p-3 rounded-lg border transition-all text-left ${
                activeTier === tier
                  ? `${cfg.bg} ${cfg.border}`
                  : "bg-dungeon-800 border-dungeon-700 hover:border-dungeon-600"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{cfg.icon}</span>
                <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
              </div>
              <div className="text-xs text-dungeon-500 mt-1 font-mono">
                {rewardsByTier[tier] || 0} reward{(rewardsByTier[tier] || 0) !== 1 ? "s" : ""}
              </div>
            </button>
          );
        })}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="dcc-card p-5 space-y-4">
          <h3 className="text-lg font-semibold text-slate-100 dcc-heading">
            {editingId ? "Edit Reward" : "New Reward"}
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-dungeon-500 block mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Fancy coffee, Movie night, Sleep in..."
                className="dcc-input w-full"
                maxLength={200}
              />
            </div>

            <div>
              <label className="text-sm text-dungeon-500 block mb-1">Description (optional)</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Details about this reward..."
                className="dcc-input w-full"
                maxLength={500}
              />
            </div>

            <div>
              <label className="text-sm text-dungeon-500 block mb-1">Tier</label>
              <div className="flex gap-2 flex-wrap">
                {TIER_SLUGS.map((tier) => {
                  const cfg = TIER_DISPLAY[tier];
                  return (
                    <button
                      key={tier}
                      onClick={() => setFormData({ ...formData, tierSlug: tier })}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        formData.tierSlug === tier
                          ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                          : "bg-dungeon-800 border-dungeon-700 text-dungeon-500 hover:border-dungeon-600"
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
              className="dcc-btn-primary disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update" : "Add to Pool"}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="dcc-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rewards List */}
      {filteredRewards.length === 0 ? (
        <div className="dcc-card p-8 text-center">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-dungeon-500">
            {activeTier !== "all"
              ? `No ${TIER_DISPLAY[activeTier]?.label} rewards yet.`
              : "Your reward pool is empty. Add rewards to make loot boxes worth opening."}
          </p>
          {rewards.length === 0 && (
            <p className="text-dungeon-500 text-sm mt-2 font-mono">
              Start with small wins — a coffee, extra screen time, a nap. Build up to the good stuff.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRewards.map((reward) => {
            const cfg = TIER_DISPLAY[reward.tier?.slug || "bronze"] || TIER_DISPLAY.bronze;
            return (
              <div
                key={reward.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${cfg.bg} ${cfg.border}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{cfg.icon}</span>
                  <div>
                    <div className="text-slate-100 font-medium">{reward.name}</div>
                    {reward.description && (
                      <div className="text-xs text-dungeon-500 mt-0.5">{reward.description}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  <button
                    onClick={() => startEdit(reward)}
                    className="text-dungeon-500 hover:text-slate-300 transition-colors p-1"
                    title="Edit"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(reward.id)}
                    className="text-dungeon-500 hover:text-crimson-400 transition-colors p-1"
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
      <div className="dcc-card p-4 text-xs text-dungeon-500 font-mono">
        <strong className="text-slate-300">How it works:</strong> When you unlock a loot box through
        achievements, The System randomly selects a reward from the matching tier. Bronze boxes pick
        from bronze rewards, gold from gold, etc. More rewards = more variety = more fun.
      </div>
    </div>
  );
}
