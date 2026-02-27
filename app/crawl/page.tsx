"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppShell from "@/components/ui/AppShell";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import type {
  CrawlerProfile,
  Achievement,
  LootBox,
  LeaderboardEntry,
  Buff,
  Debuff,
  XpLedgerEntry,
} from "@/lib/types";

type Tab = "profile" | "achievements" | "loot" | "leaderboard";

const TIER_COLORS: Record<string, string> = {
  common: "text-slate-400 border-slate-600",
  uncommon: "text-green-400 border-green-600",
  rare: "text-blue-400 border-blue-600",
  epic: "text-purple-400 border-purple-600",
  legendary: "text-amber-400 border-amber-500",
};

const TIER_BG: Record<string, string> = {
  common: "bg-slate-800",
  uncommon: "bg-green-950/30",
  rare: "bg-blue-950/30",
  epic: "bg-purple-950/30",
  legendary: "bg-amber-950/30",
};

const BOX_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  bronze: { bg: "bg-amber-900/20", border: "border-amber-700", text: "text-amber-500" },
  silver: { bg: "bg-slate-700/20", border: "border-slate-500", text: "text-slate-300" },
  gold: { bg: "bg-yellow-900/20", border: "border-yellow-600", text: "text-yellow-400" },
  platinum: { bg: "bg-slate-200/5", border: "border-slate-300", text: "text-slate-100" },
};

export default function CrawlPage() {
  const toast = useToast();
  const [user, setUser] = useState<{ full_name: string; email: string; avatar_url?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [loading, setLoading] = useState(true);

  // Profile state
  const [profile, setProfile] = useState<CrawlerProfile | null>(null);
  const [buffs, setBuffs] = useState<Buff[]>([]);
  const [debuffs, setDebuffs] = useState<Debuff[]>([]);
  const [recentXp, setRecentXp] = useState<XpLedgerEntry[]>([]);
  const [stats, setStats] = useState({ achievement_count: 0, unopened_boxes: 0 });

  // Achievements state
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [achievementFilter, setAchievementFilter] = useState<string>("all");

  // Loot box state
  const [lootBoxes, setLootBoxes] = useState<LootBox[]>([]);
  const [openingBox, setOpeningBox] = useState<string | null>(null);
  const [openResult, setOpenResult] = useState<{ tierName: string; rewardName: string; rewardIcon?: string } | null>(null);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderPeriod, setLeaderPeriod] = useState<string>("alltime");

  // Fetch user
  useEffect(() => {
    fetch("/api/user")
      .then(r => r.json())
      .then(data => setUser(data.user))
      .catch(() => {});
  }, []);

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/gamification");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProfile(data.profile);
      setBuffs(data.buffs);
      setDebuffs(data.debuffs);
      setRecentXp(data.recent_xp);
      setStats(data.stats);
    } catch {
      toast.error("Failed to load crawler profile");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // Fetch achievements
  const fetchAchievements = useCallback(async () => {
    try {
      const res = await fetch("/api/gamification/achievements");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAchievements(data.achievements);
    } catch {
      toast.error("Failed to load achievements");
    }
  }, [toast]);

  // Fetch loot boxes
  const fetchLootBoxes = useCallback(async () => {
    try {
      const res = await fetch("/api/gamification/loot-boxes");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLootBoxes(data.loot_boxes);
    } catch {
      toast.error("Failed to load loot boxes");
    }
  }, [toast]);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/gamification/leaderboard?period=${leaderPeriod}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLeaderboard(data.leaderboard);
    } catch {
      toast.error("Failed to load leaderboard");
    }
  }, [toast, leaderPeriod]);

  // Load tab data on switch
  useEffect(() => {
    if (tab === "achievements") fetchAchievements();
    if (tab === "loot") fetchLootBoxes();
    if (tab === "leaderboard") fetchLeaderboard();
  }, [tab, fetchAchievements, fetchLootBoxes, fetchLeaderboard]);

  // Open loot box
  const handleOpenBox = async (boxId: string) => {
    setOpeningBox(boxId);
    setOpenResult(null);
    try {
      const res = await fetch("/api/gamification/loot-boxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loot_box_id: boxId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOpenResult({
        tierName: data.result.tierName,
        rewardName: data.result.rewardName,
        rewardIcon: data.result.rewardIcon,
      });
      fetchLootBoxes();
      fetchProfile();
    } catch {
      toast.error("Failed to open loot box. Make sure you have rewards configured!");
    } finally {
      setOpeningBox(null);
    }
  };

  if (!user) return <LoadingSpinner size="lg" />;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "profile", label: "Crawler Card", icon: "🗡️" },
    { id: "achievements", label: "Achievements", icon: "🏆" },
    { id: "loot", label: "Loot Boxes", icon: "📦" },
    { id: "leaderboard", label: "Leaderboard", icon: "📊" },
  ];

  const filteredAchievements = achievementFilter === "all"
    ? achievements
    : achievementFilter === "unlocked"
      ? achievements.filter(a => a.unlocked)
      : achievements.filter(a => a.category === achievementFilter);

  return (
    <AppShell user={user}>
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-100">The Crawl</h1>
          <p className="text-slate-400 text-sm mt-1 italic">So fun it hurts.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-800 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 font-medium transition-colors border-b-2 whitespace-nowrap ${
                tab === t.id
                  ? "text-red-400 border-red-400"
                  : "text-slate-400 border-transparent hover:text-slate-100"
              }`}
            >
              <span className="mr-2">{t.icon}</span>
              {t.label}
              {t.id === "loot" && stats.unopened_boxes > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
                  {stats.unopened_boxes}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {loading && tab === "profile" ? (
          <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
        ) : tab === "profile" && profile ? (
          <div className="space-y-6">
            {/* Crawler Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
              {/* Floor color accent */}
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: profile.floor?.color || "#DC2626" }}
              />

              <div className="flex items-start gap-6">
                {/* Level circle */}
                <div className="flex-shrink-0">
                  <div className="w-20 h-20 rounded-full border-4 border-red-500 flex items-center justify-center bg-slate-950">
                    <span className="text-2xl font-bold text-red-400">{profile.level || profile.current_level}</span>
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 mb-1">
                    <h2 className="text-2xl font-bold text-slate-100">{profile.crawler_name}</h2>
                    {profile.title && (
                      <span className="text-sm text-amber-400 font-medium">{profile.title}</span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm mb-3">
                    {profile.floor?.icon} Floor {profile.floor_number || 1}: {profile.floor?.name || "The Stairwell"}
                  </p>

                  {/* XP Bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>{profile.total_xp.toLocaleString()} XP</span>
                      <span>{profile.xp_to_next?.toLocaleString()} XP to next level</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, profile.xp_progress || 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div className="flex gap-4 text-sm mt-3">
                    <span className="text-slate-400">
                      🔥 {profile.login_streak}d login streak
                    </span>
                    <span className="text-slate-400">
                      🏆 {stats.achievement_count} achievements
                    </span>
                    {stats.unopened_boxes > 0 && (
                      <span className="text-amber-400 font-medium">
                        📦 {stats.unopened_boxes} unopened box{stats.unopened_boxes > 1 ? "es" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Buffs & Debuffs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Buffs */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-green-400 mb-3">⬆️ Active Buffs</h3>
                {buffs.length === 0 ? (
                  <p className="text-slate-500 text-sm">No active streaks. Start one today.</p>
                ) : (
                  <div className="space-y-2">
                    {buffs.map(b => (
                      <div key={b.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-300">{b.name}</span>
                        <span className="text-green-400 font-mono">{b.streak}d 🔥</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Debuffs */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-red-400 mb-3">⬇️ Active Debuffs</h3>
                {debuffs.length === 0 ? (
                  <p className="text-slate-500 text-sm">No overdue tasks. The System is suspicious.</p>
                ) : (
                  <div className="space-y-2">
                    {debuffs.map(d => (
                      <div key={d.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-300 truncate">{d.name}</span>
                        <span className="text-red-400 text-xs">overdue</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/crawl/party"
                className="flex items-center gap-3 p-4 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-all"
              >
                <span className="text-lg">👥</span>
                <span className="text-sm text-slate-300 font-medium">Party Quests</span>
              </Link>
              <Link
                href="/crawl/rewards"
                className="flex items-center gap-3 p-4 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-all"
              >
                <span className="text-lg">🎁</span>
                <span className="text-sm text-slate-300 font-medium">Reward Pool</span>
              </Link>
            </div>

            {/* Recent XP */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-100 mb-3">⚡ Recent XP</h3>
              {recentXp.length === 0 ? (
                <p className="text-slate-500 text-sm">No XP earned yet. Complete tasks to start gaining XP.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {recentXp.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300 truncate flex-1">{entry.description}</span>
                      <span className={`font-mono ml-3 ${entry.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {entry.amount >= 0 ? "+" : ""}{entry.amount} XP
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : tab === "achievements" ? (
          <div className="space-y-4">
            {/* Filter */}
            <div className="flex gap-2 flex-wrap">
              {["all", "unlocked", "productivity", "health", "streak", "finance", "party", "meta"].map(f => (
                <button
                  key={f}
                  onClick={() => setAchievementFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    achievementFilter === f
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-100"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {/* Achievement Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredAchievements.map(a => (
                <div
                  key={a.id}
                  className={`rounded-lg border p-4 transition-all ${
                    a.unlocked
                      ? `${TIER_BG[a.tier]} ${TIER_COLORS[a.tier]}`
                      : "bg-slate-900 border-slate-800 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{a.icon || "❓"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className={`font-semibold text-sm ${a.unlocked ? "text-slate-100" : "text-slate-400"}`}>
                          {a.name}
                        </h4>
                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${TIER_COLORS[a.tier]} border`}>
                          {a.tier}
                        </span>
                        {a.is_party && <span className="text-xs">🤝</span>}
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2">{a.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                        <span>+{a.xp_reward} XP</span>
                        {a.loot_box_tier && <span>📦 {a.loot_box_tier}</span>}
                        {a.unlocked && a.unlock_count > 1 && <span>×{a.unlock_count}</span>}
                      </div>
                    </div>
                    {a.unlocked && (
                      <span className="text-green-400 text-lg">✓</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : tab === "loot" ? (
          <div className="space-y-6">
            {/* Manage Rewards Link */}
            <div className="flex justify-end">
              <Link
                href="/crawl/rewards"
                className="text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Manage Reward Pool &rarr;
              </Link>
            </div>

            {/* Open result overlay */}
            {openResult && (
              <div className="bg-slate-900 border-2 border-amber-500 rounded-xl p-6 text-center animate-pulse">
                <div className="text-4xl mb-3">{openResult.rewardIcon || "🎁"}</div>
                <h3 className="text-xl font-bold text-amber-400 mb-1">{openResult.tierName}</h3>
                <p className="text-lg text-slate-100 font-medium">{openResult.rewardName}</p>
                <p className="text-slate-400 text-sm mt-2 italic">
                  The System does not understand your reward system but acknowledges its importance to crawler morale.
                </p>
                <button
                  onClick={() => setOpenResult(null)}
                  className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-sm transition-colors"
                >
                  Nice
                </button>
              </div>
            )}

            {/* Unopened boxes */}
            {lootBoxes.filter(b => !b.opened).length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-100 mb-3">📦 Unopened Boxes</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {lootBoxes.filter(b => !b.opened).map(box => {
                    const style = BOX_COLORS[box.tier?.slug || "bronze"];
                    return (
                      <div key={box.id} className={`${style.bg} border ${style.border} rounded-lg p-4`}>
                        <div className="text-center mb-2">
                          <span className="text-3xl">{box.tier?.icon || "📦"}</span>
                        </div>
                        <h4 className={`font-semibold text-sm text-center ${style.text}`}>
                          {box.tier?.name || "Box"}
                        </h4>
                        <p className="text-xs text-slate-400 text-center mt-1 mb-3">{box.source_description}</p>
                        <button
                          onClick={() => handleOpenBox(box.id)}
                          disabled={openingBox === box.id}
                          className="w-full px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-slate-700 text-white font-medium rounded-lg text-sm transition-colors"
                        >
                          {openingBox === box.id ? "Opening..." : "Open Box"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* History */}
            <div>
              <h3 className="text-lg font-semibold text-slate-100 mb-3">History</h3>
              {lootBoxes.filter(b => b.opened).length === 0 ? (
                <p className="text-slate-500 text-sm">No boxes opened yet.</p>
              ) : (
                <div className="space-y-2">
                  {lootBoxes.filter(b => b.opened).map(box => (
                    <div key={box.id} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-3">
                        <span>{box.tier?.icon || "📦"}</span>
                        <span className="text-slate-300">{box.tier?.name}: {box.reward?.name || "Unknown"}</span>
                      </div>
                      <span className="text-slate-500 text-xs">
                        {box.opened_at ? new Date(box.opened_at).toLocaleDateString() : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : tab === "leaderboard" ? (
          <div className="space-y-4">
            {/* Period filter */}
            <div className="flex gap-2">
              {[
                { id: "alltime", label: "All Time" },
                { id: "monthly", label: "This Month" },
                { id: "weekly", label: "This Week" },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setLeaderPeriod(p.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    leaderPeriod === p.id
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-100"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Leaderboard */}
            <div className="space-y-2">
              {leaderboard.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">No data for this period yet.</p>
              ) : (
                leaderboard.map(entry => (
                  <div
                    key={entry.user_id}
                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                      entry.is_current_user
                        ? "bg-red-950/20 border-red-500/30"
                        : "bg-slate-900 border-slate-800"
                    }`}
                  >
                    {/* Rank */}
                    <div className="w-10 text-center">
                      <span className={`text-2xl font-bold ${
                        entry.rank === 1 ? "text-amber-400" : "text-slate-500"
                      }`}>
                        {entry.rank === 1 ? "👑" : `#${entry.rank}`}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <h4 className="font-semibold text-slate-100">{entry.crawler_name}</h4>
                        {entry.title && (
                          <span className="text-xs text-amber-400">{entry.title}</span>
                        )}
                        <span className="text-xs text-slate-500">Lv.{entry.level}</span>
                      </div>
                      {entry.achievements_unlocked !== undefined && (
                        <p className="text-xs text-slate-400">
                          {entry.achievements_unlocked} achievements · {entry.login_streak}d streak
                        </p>
                      )}
                    </div>

                    {/* XP */}
                    <div className="text-right">
                      <span className="text-lg font-bold text-red-400">
                        {(entry.total_xp || entry.xp_earned || 0).toLocaleString()}
                      </span>
                      <span className="text-sm text-slate-400 ml-1">XP</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
