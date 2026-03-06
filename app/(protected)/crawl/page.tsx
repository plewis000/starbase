"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
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
  common: "text-dungeon-500 border-dungeon-600",
  uncommon: "text-green-400 border-green-700",
  rare: "text-blue-400 border-blue-700",
  epic: "text-purple-400 border-purple-700",
  legendary: "text-orange-400 border-orange-600",
};

const TIER_BG: Record<string, string> = {
  common: "bg-dungeon-800",
  uncommon: "bg-green-950/20",
  rare: "bg-blue-950/20",
  epic: "bg-purple-950/20",
  legendary: "bg-orange-950/20",
};

const BOX_COLORS: Record<string, { bg: string; border: string; text: string; glow?: string }> = {
  bronze: { bg: "bg-amber-900/15", border: "border-amber-800", text: "text-amber-500" },
  silver: { bg: "bg-dungeon-700/30", border: "border-dungeon-600", text: "text-slate-300" },
  gold: { bg: "bg-gold-900/20", border: "border-gold-700", text: "text-gold-400", glow: "dcc-glow-gold" },
  platinum: { bg: "bg-slate-200/5", border: "border-slate-400", text: "text-slate-100" },
  legendary: { bg: "bg-orange-950/20", border: "border-orange-600", text: "text-orange-400", glow: "dcc-glow-legendary" },
  celestial: { bg: "bg-fuchsia-950/20", border: "border-fuchsia-600", text: "text-fuchsia-400", glow: "dcc-glow-celestial" },
};

const CLASS_ICONS: Record<string, string> = {
  berserker: "⚔️", ranger: "🏹", scholar: "📖", paladin: "🛡️",
  monk: "🧘", artificer: "⚙️", warden: "🏠", unclassed: "❓",
};

const STAT_COLORS: Record<string, string> = {
  str: "#ef4444", dex: "#22c55e", con: "#f59e0b", int: "#3b82f6", cha: "#a855f7",
};

const STAT_LABELS: Record<string, string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", cha: "CHA",
};

// --- Stat Pentagon SVG ---
function StatPentagon({ stats }: { stats: { str: number; dex: number; con: number; int: number; cha: number } }) {
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 55;
  const statKeys = ["str", "dex", "con", "int", "cha"] as const;

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
    const r = (value / 20) * maxR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const gridLevels = [5, 10, 15, 20];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-36 h-36">
      {/* Grid */}
      {gridLevels.map(level => {
        const points = statKeys.map((_, i) => getPoint(i, level));
        return (
          <polygon
            key={level}
            points={points.map(p => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#252a3a"
            strokeWidth="0.5"
          />
        );
      })}
      {/* Axis lines */}
      {statKeys.map((_, i) => {
        const p = getPoint(i, 20);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#252a3a" strokeWidth="0.5" />;
      })}
      {/* Stat polygon */}
      <polygon
        points={statKeys.map((key, i) => {
          const p = getPoint(i, stats[key]);
          return `${p.x},${p.y}`;
        }).join(" ")}
        fill="rgba(220, 38, 38, 0.15)"
        stroke="#DC2626"
        strokeWidth="1.5"
      />
      {/* Stat dots + labels */}
      {statKeys.map((key, i) => {
        const p = getPoint(i, stats[key]);
        const lp = getPoint(i, 23);
        return (
          <g key={key}>
            <circle cx={p.x} cy={p.y} r="3" fill={STAT_COLORS[key]} />
            <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fill={STAT_COLORS[key]} fontSize="8" fontFamily="monospace" fontWeight="bold">
              {STAT_LABELS[key]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// --- Stat Bars ---
function StatBars({ stats }: { stats: { str: number; dex: number; con: number; int: number; cha: number } }) {
  const statKeys = ["str", "dex", "con", "int", "cha"] as const;
  return (
    <div className="space-y-2">
      {statKeys.map(key => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-xs font-mono w-8" style={{ color: STAT_COLORS[key] }}>{STAT_LABELS[key]}</span>
          <div className="dcc-stat-bar flex-1">
            <div className="dcc-stat-fill dcc-stat-bar-fill" style={{ width: `${(stats[key] / 20) * 100}%`, backgroundColor: STAT_COLORS[key] }} />
          </div>
          <span className="text-xs font-mono text-dungeon-500 w-6 text-right">{stats[key]}</span>
        </div>
      ))}
    </div>
  );
}

// --- Loot Box Opening Ceremony ---
type CeremonyStage = "idle" | "shaking" | "bursting" | "revealing" | "done";

function LootBoxCeremony({
  result,
  onDismiss,
}: {
  result: { tierName: string; tierSlug: string; rewardName: string; rewardIcon?: string };
  onDismiss: () => void;
}) {
  const [stage, setStage] = useState<CeremonyStage>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const style = BOX_COLORS[result.tierSlug] || BOX_COLORS.bronze;

  useEffect(() => {
    setStage("shaking");
    timerRef.current = setTimeout(() => setStage("bursting"), 800);
    return () => clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (stage === "bursting") {
      timerRef.current = setTimeout(() => setStage("revealing"), 500);
    }
    if (stage === "revealing") {
      timerRef.current = setTimeout(() => setStage("done"), 900);
    }
    return () => clearTimeout(timerRef.current);
  }, [stage]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={stage === "done" ? onDismiss : undefined}>
      <div className={`relative p-8 rounded-2xl border-2 ${style.border} ${style.bg} max-w-sm w-full mx-4 text-center ${style.glow || ""}`}>
        {/* Box shaking phase */}
        {(stage === "shaking" || stage === "idle") && (
          <div className={stage === "shaking" ? "dcc-box-shake" : ""}>
            <span className="text-7xl block mb-4">📦</span>
            <p className={`font-semibold dcc-heading ${style.text}`}>{result.tierName}</p>
          </div>
        )}
        {/* Burst phase */}
        {stage === "bursting" && (
          <div className="dcc-box-burst">
            <span className="text-7xl block mb-4">📦</span>
          </div>
        )}
        {/* Reveal phase */}
        {(stage === "revealing" || stage === "done") && (
          <div className={stage === "revealing" ? "dcc-reward-reveal" : ""}>
            <span className="text-6xl block mb-4">{result.rewardIcon || "🎁"}</span>
            <h3 className={`text-2xl font-bold mb-2 dcc-heading ${style.text}`}>{result.tierName}</h3>
            <p className="text-lg text-slate-100 font-medium mb-3">{result.rewardName}</p>
            <p className="text-dungeon-500 text-sm italic font-mono mb-4">
              The System does not understand your reward system but acknowledges its importance to crawler morale.
            </p>
            {stage === "done" && (
              <button onClick={onDismiss} className="dcc-btn-primary">
                Claim Reward
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ActivationReadiness {
  ready: boolean;
  modules: {
    tasks: { count: number; ready: boolean };
    habits: { count: number; ready: boolean };
    finance: { count: number; ready: boolean };
    goals: { count: number; ready: boolean };
  };
  totalReady: number;
  minRequired: number;
  hasRewards: boolean;
}

export default function CrawlPage() {
  const toast = useToast();
  const [user, setUser] = useState<{ full_name: string; email: string; avatar_url?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [loading, setLoading] = useState(true);

  // Activation state
  const [activated, setActivated] = useState<boolean>(true); // default true to avoid flash
  const [activation, setActivation] = useState<ActivationReadiness | null>(null);
  const [activating, setActivating] = useState(false);

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
  const [ceremonyResult, setCeremonyResult] = useState<{ tierName: string; tierSlug: string; rewardName: string; rewardIcon?: string } | null>(null);

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
      setActivated(data.activated !== false);
      setActivation(data.activation || null);
      setProfile(data.profile);
      setBuffs(data.buffs);
      setDebuffs(data.debuffs);
      setRecentXp(data.recent_xp);
      setStats(data.stats);
    } catch {
      // Silently fail — gamification tables may not exist yet
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
      // Silently fail
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
      // Silently fail
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
      // Silently fail
    }
  }, [toast, leaderPeriod]);

  // Load tab data on switch
  useEffect(() => {
    if (tab === "achievements") fetchAchievements();
    if (tab === "loot") fetchLootBoxes();
    if (tab === "leaderboard") fetchLeaderboard();
  }, [tab, fetchAchievements, fetchLootBoxes, fetchLeaderboard]);

  // Open loot box with ceremony
  const handleOpenBox = async (boxId: string) => {
    setOpeningBox(boxId);
    setCeremonyResult(null);
    try {
      const res = await fetch("/api/gamification/loot-boxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loot_box_id: boxId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      // Find the box to get the tier slug
      const box = lootBoxes.find(b => b.id === boxId);
      setCeremonyResult({
        tierName: data.result.tierName,
        tierSlug: box?.tier?.slug || "bronze",
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

  const handleActivate = async () => {
    setActivating(true);
    try {
      const res = await fetch("/api/gamification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to activate");
        return;
      }
      setActivated(true);
      setActivation(null);
      toast.success("The Crawl has begun. Good luck, crawler.");
      fetchProfile();
    } catch {
      toast.error("Failed to activate gamification");
    } finally {
      setActivating(false);
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

  const crawlerStats = profile ? {
    str: profile.stat_str || 0,
    dex: profile.stat_dex || 0,
    con: profile.stat_con || 0,
    int: profile.stat_int || 0,
    cha: profile.stat_cha || 0,
  } : { str: 0, dex: 0, con: 0, int: 0, cha: 0 };

  return (
    <>
      {/* Loot Box Opening Ceremony */}
      {ceremonyResult && (
        <LootBoxCeremony result={ceremonyResult} onDismiss={() => setCeremonyResult(null)} />
      )}

      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-100 dcc-heading tracking-wider">The Crawl</h1>
          <p className="text-dungeon-500 text-sm mt-1 italic font-mono">So fun it hurts.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-dungeon-700 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 font-medium transition-colors border-b-2 whitespace-nowrap ${
                tab === t.id
                  ? "text-crimson-400 border-crimson-500"
                  : "text-dungeon-500 border-transparent hover:text-slate-100"
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

        {/* Onboarding — shown when gamification not yet activated */}
        {!activated && !loading ? (
          <div className="max-w-lg mx-auto space-y-6">
            <div className="dcc-card p-8 text-center">
              <span className="text-5xl block mb-4">🗡️</span>
              <h2 className="text-2xl font-bold text-slate-100 dcc-heading mb-2">Enter The Crawl</h2>
              <p className="text-dungeon-500 text-sm font-mono mb-6">
                The System has been watching. Before you can enter the dungeon, you need to prove you&apos;re worth tracking.
              </p>

              {/* Prerequisites checklist */}
              <div className="text-left space-y-3 mb-6">
                <p className="text-xs text-dungeon-500 uppercase tracking-wider font-mono mb-2">Prerequisites</p>

                {activation && Object.entries(activation.modules).map(([key, mod]) => {
                  const labels: Record<string, { name: string; min: number }> = {
                    tasks: { name: "Complete tasks", min: 5 },
                    habits: { name: "Log habit check-ins", min: 3 },
                    finance: { name: "Track transactions", min: 5 },
                    goals: { name: "Set a goal", min: 1 },
                  };
                  const label = labels[key];
                  return (
                    <div key={key} className={`flex items-center gap-3 p-3 rounded-lg border ${
                      mod.ready ? "border-green-800 bg-green-950/20" : "border-dungeon-700 bg-dungeon-800"
                    }`}>
                      <span className="text-lg">{mod.ready ? "✅" : "⬜"}</span>
                      <div className="flex-1">
                        <span className={`text-sm ${mod.ready ? "text-green-400" : "text-slate-400"}`}>
                          {label?.name || key}
                        </span>
                        <span className="text-xs text-dungeon-500 ml-2 font-mono">
                          {mod.count}/{label?.min || 1}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {activation && (
                  <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                    activation.hasRewards ? "border-green-800 bg-green-950/20" : "border-dungeon-700 bg-dungeon-800"
                  }`}>
                    <span className="text-lg">{activation.hasRewards ? "✅" : "⬜"}</span>
                    <div className="flex-1">
                      <span className={`text-sm ${activation.hasRewards ? "text-green-400" : "text-slate-400"}`}>
                        Set up loot box rewards
                      </span>
                      {!activation.hasRewards && (
                        <Link href="/crawl/rewards" className="text-xs text-crimson-400 ml-2 hover:text-crimson-300">
                          Set up rewards &rarr;
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-xs text-dungeon-500 font-mono mt-3">
                  Need data in at least {activation?.minRequired || 2} modules + rewards configured.
                  {activation && ` (${activation.totalReady}/${activation.minRequired} modules ready)`}
                </p>
              </div>

              <button
                onClick={handleActivate}
                disabled={!activation?.ready || activating}
                className={`w-full py-3 rounded-lg font-medium text-sm transition-all ${
                  activation?.ready
                    ? "dcc-btn-primary"
                    : "bg-dungeon-800 text-dungeon-500 border border-dungeon-700 cursor-not-allowed"
                }`}
              >
                {activating ? "Activating..." : activation?.ready ? "Begin The Crawl" : "Not Ready Yet"}
              </button>
            </div>
          </div>
        ) : /* Tab Content */
        loading && tab === "profile" ? (
          <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
        ) : tab === "profile" && profile ? (
          <div className="space-y-6">
            {/* Crawler Card — Enhanced with class + stats */}
            <div className="dcc-card p-6 relative overflow-hidden">
              {/* Floor color accent */}
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: profile.floor?.color || "#DC2626" }}
              />

              <div className="flex flex-col md:flex-row items-start gap-6">
                {/* Left: Level + Class */}
                <div className="flex-shrink-0 flex flex-col items-center gap-2">
                  <div className="w-20 h-20 rounded-full border-4 border-crimson-500 flex items-center justify-center bg-dungeon-950 dcc-glow-crimson">
                    <span className="text-2xl font-bold text-crimson-400 font-mono">{profile.level || profile.current_level}</span>
                  </div>
                  {/* Class badge */}
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-dungeon-800 border border-dungeon-700">
                    <span className="text-sm">{CLASS_ICONS[profile.crawler_class || "unclassed"]}</span>
                    <span className="text-xs font-mono text-slate-300 capitalize">{profile.crawler_class || "Unclassed"}</span>
                  </div>
                </div>

                {/* Center: Info + XP */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 mb-1">
                    <h2 className="text-2xl font-bold text-slate-100 dcc-heading tracking-wide">{profile.crawler_name}</h2>
                    {profile.title && (
                      <span className="text-sm text-gold-400 font-medium">{profile.title}</span>
                    )}
                  </div>
                  <p className="text-dungeon-500 text-sm mb-3 font-mono">
                    {profile.floor?.icon} Floor {profile.floor_number || 1}: {profile.floor?.name || "The Stairwell"}
                  </p>

                  {/* XP Bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-dungeon-500 mb-1 font-mono">
                      <span>{profile.total_xp.toLocaleString()} XP</span>
                      <span>{profile.xp_to_next?.toLocaleString()} XP to next level</span>
                    </div>
                    <div className="dcc-xp-bar h-3">
                      <div
                        className="dcc-xp-fill"
                        style={{ width: `${Math.min(100, profile.xp_progress || 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div className="flex gap-4 text-sm mt-3 font-mono">
                    <span className="text-dungeon-500">
                      🔥 {profile.login_streak}d streak
                    </span>
                    <span className="text-dungeon-500">
                      🏆 {stats.achievement_count} achievements
                    </span>
                    {stats.unopened_boxes > 0 && (
                      <span className="text-gold-400 font-medium">
                        📦 {stats.unopened_boxes} unopened box{stats.unopened_boxes > 1 ? "es" : ""}
                      </span>
                    )}
                  </div>

                  {/* Class description */}
                  {profile.class_description && (
                    <p className="text-xs text-dungeon-500 mt-2 italic font-mono">&quot;{profile.class_description}&quot;</p>
                  )}
                </div>

                {/* Right: Stat Pentagon */}
                <div className="flex-shrink-0 hidden lg:block">
                  <StatPentagon stats={crawlerStats} />
                </div>
              </div>

              {/* Stat Bars (mobile/tablet — below main card) */}
              <div className="mt-4 lg:hidden">
                <StatBars stats={crawlerStats} />
              </div>

              {/* Stat Bars (desktop — below pentagon) */}
              <div className="hidden lg:block mt-4 pt-4 border-t border-dungeon-700/50">
                <StatBars stats={crawlerStats} />
              </div>
            </div>

            {/* Buffs & Debuffs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="dcc-card p-4">
                <h3 className="text-sm font-semibold text-green-400 mb-3">⬆️ Active Buffs</h3>
                {buffs.length === 0 ? (
                  <p className="text-dungeon-500 text-sm font-mono">No active streaks. Start one today.</p>
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

              <div className="dcc-card-system p-4">
                <h3 className="text-sm font-semibold text-crimson-400 mb-3">⬇️ Active Debuffs</h3>
                {debuffs.length === 0 ? (
                  <p className="text-dungeon-500 text-sm font-mono">No overdue tasks. The System is suspicious.</p>
                ) : (
                  <div className="space-y-2">
                    {debuffs.map(d => (
                      <div key={d.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-300 truncate">{d.name}</span>
                        <span className="text-crimson-400 text-xs font-mono">overdue</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/crawl/party" className="dcc-card-hover flex items-center gap-3 p-4">
                <span className="text-lg">👥</span>
                <span className="text-sm text-slate-300 font-medium">Party Quests</span>
              </Link>
              <Link href="/crawl/rewards" className="dcc-card-hover flex items-center gap-3 p-4">
                <span className="text-lg">🎁</span>
                <span className="text-sm text-slate-300 font-medium">Reward Pool</span>
              </Link>
            </div>

            {/* Recent XP */}
            <div className="dcc-card p-4">
              <h3 className="text-sm font-semibold text-slate-100 mb-3">⚡ Recent XP</h3>
              {recentXp.length === 0 ? (
                <p className="text-dungeon-500 text-sm font-mono">No XP earned yet. Complete tasks to start gaining XP.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {recentXp.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300 truncate flex-1">{entry.description}</span>
                      <span className={`font-mono ml-3 ${entry.amount >= 0 ? "text-green-400" : "text-crimson-400"}`}>
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
                      ? "bg-crimson-900/30 text-crimson-400 border border-crimson-800"
                      : "bg-dungeon-800 text-dungeon-500 border border-dungeon-700 hover:text-slate-100"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {/* Achievement count */}
            <p className="text-xs text-dungeon-500 font-mono">
              {achievements.filter(a => a.unlocked).length}/{achievements.length} unlocked
            </p>

            {/* Achievement Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredAchievements.map(a => {
                const isHiddenLocked = a.is_hidden && !a.unlocked;
                return (
                  <div
                    key={a.id}
                    className={`rounded-lg border p-4 transition-all ${
                      a.unlocked
                        ? `${TIER_BG[a.tier]} ${TIER_COLORS[a.tier]}`
                        : isHiddenLocked
                          ? "bg-dungeon-900 border-dungeon-800 opacity-40"
                          : "bg-dungeon-800 border-dungeon-700 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">
                        {isHiddenLocked ? "🔒" : (a.icon || "❓")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className={`font-semibold text-sm ${a.unlocked ? "text-slate-100" : "text-slate-400"}`}>
                            {isHiddenLocked ? "Hidden Achievement" : a.name}
                          </h4>
                          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${TIER_COLORS[a.tier]} border`}>
                            {a.tier}
                          </span>
                          {a.is_party && <span className="text-xs">🤝</span>}
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2">
                          {isHiddenLocked ? "Keep crawling to discover this achievement..." : a.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                          <span>+{a.xp_reward} XP</span>
                          {a.loot_box_tier && <span>📦 {a.loot_box_tier}</span>}
                          {a.unlocked && a.unlock_count > 1 && <span>x{a.unlock_count}</span>}
                          {a.unlocked && a.unlocked_at && (
                            <span className="text-dungeon-500">{new Date(a.unlocked_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      {a.unlocked && (
                        <span className="text-green-400 text-lg">✓</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : tab === "loot" ? (
          <div className="space-y-6">
            {/* Manage Rewards Link */}
            <div className="flex justify-end">
              <Link
                href="/crawl/rewards"
                className="text-sm text-crimson-400 hover:text-crimson-300 transition-colors font-mono"
              >
                Manage Reward Pool &rarr;
              </Link>
            </div>

            {/* Unopened boxes */}
            {lootBoxes.filter(b => !b.opened).length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-100 mb-3">📦 Unopened Boxes</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {lootBoxes.filter(b => !b.opened).map(box => {
                    const tierSlug = box.tier?.slug || "bronze";
                    const style = BOX_COLORS[tierSlug] || BOX_COLORS.bronze;
                    return (
                      <div key={box.id} className={`${style.bg} border ${style.border} rounded-lg p-4 ${style.glow || ""}`}>
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
                          className="w-full dcc-btn-primary disabled:bg-dungeon-700 disabled:shadow-none"
                        >
                          {openingBox === box.id ? "Opening..." : "Open Box"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No boxes message */}
            {lootBoxes.filter(b => !b.opened).length === 0 && (
              <div className="dcc-card p-6 text-center">
                <span className="text-4xl block mb-3">📦</span>
                <p className="text-dungeon-500 font-mono text-sm">No unopened boxes. Keep crawling to earn more.</p>
              </div>
            )}

            {/* History */}
            <div>
              <h3 className="text-lg font-semibold text-slate-100 mb-3">History</h3>
              {lootBoxes.filter(b => b.opened).length === 0 ? (
                <p className="text-dungeon-500 text-sm font-mono">No boxes opened yet.</p>
              ) : (
                <div className="space-y-2">
                  {lootBoxes.filter(b => b.opened).map(box => {
                    const tierSlug = box.tier?.slug || "bronze";
                    const style = BOX_COLORS[tierSlug] || BOX_COLORS.bronze;
                    return (
                      <div key={box.id} className="flex items-center justify-between bg-dungeon-800 border border-dungeon-700 rounded-lg p-3 text-sm">
                        <div className="flex items-center gap-3">
                          <span>{box.tier?.icon || "📦"}</span>
                          <span className="text-slate-300">{box.tier?.name}: {box.reward?.name || "Unknown"}</span>
                          <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${style.text} ${style.border}`}>
                            {tierSlug}
                          </span>
                        </div>
                        <span className="text-dungeon-500 text-xs font-mono">
                          {box.opened_at ? new Date(box.opened_at).toLocaleDateString() : ""}
                        </span>
                      </div>
                    );
                  })}
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
                      ? "bg-crimson-900/30 text-crimson-400 border border-crimson-800"
                      : "bg-dungeon-800 text-dungeon-500 border border-dungeon-700 hover:text-slate-100"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Leaderboard */}
            <div className="space-y-2">
              {leaderboard.length === 0 ? (
                <p className="text-dungeon-500 text-sm py-4 font-mono">No data for this period yet.</p>
              ) : (
                leaderboard.map(entry => (
                  <div
                    key={entry.user_id}
                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                      entry.is_current_user
                        ? "bg-crimson-900/15 border-crimson-800 dcc-glow-crimson"
                        : "bg-dungeon-800 border-dungeon-700"
                    }`}
                  >
                    {/* Rank */}
                    <div className="w-10 text-center">
                      <span className={`text-2xl font-bold ${
                        entry.rank === 1 ? "text-gold-400" : entry.rank === 2 ? "text-slate-300" : entry.rank === 3 ? "text-amber-600" : "text-dungeon-500"
                      }`}>
                        {entry.rank === 1 ? "👑" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <h4 className="font-semibold text-slate-100">{entry.crawler_name}</h4>
                        {entry.title && (
                          <span className="text-xs text-gold-400">{entry.title}</span>
                        )}
                        <span className="text-xs text-dungeon-500 font-mono">Lv.{entry.level}</span>
                      </div>
                      {entry.achievements_unlocked !== undefined && (
                        <p className="text-xs text-dungeon-500">
                          {entry.achievements_unlocked} achievements · {entry.login_streak}d streak
                        </p>
                      )}
                    </div>

                    {/* XP */}
                    <div className="text-right">
                      <span className="text-lg font-bold text-crimson-400 font-mono">
                        {(entry.total_xp || entry.xp_earned || 0).toLocaleString()}
                      </span>
                      <span className="text-sm text-dungeon-500 ml-1">XP</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
