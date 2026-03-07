"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OutcomesPanel from "@/components/dashboard/OutcomesPanel";
import { DashboardSkeleton } from "@/components/ui/Skeleton";

interface HouseholdMember {
  id: string;
  name: string;
  is_current_user: boolean;
  tasks: { overdue: number; open: number; completed_this_week: number };
  habits: { total: number; checked_today: number; rate: number; top_streaks: { title: string; streak: number }[] };
  crawler: { level: number; xp: number } | null;
}

interface HouseholdData {
  members: HouseholdMember[];
  household: {
    total_overdue: number;
    total_open: number;
    completed_this_week: number;
    habit_rate: number;
    workload_imbalance: number;
    balance_status: string;
  };
  weekly_trend: { date: string; tasks: number; habits_rate: number; xp: number }[];
}

interface Suggestion {
  id: string;
  category: string;
  title: string;
  description: string;
  priority: number;
  confidence: number;
}

interface DashboardHabit {
  id: string;
  title: string;
  current_streak: number;
  checked_today?: boolean;
}

interface ShoppingListSummary {
  id: string;
  name: string;
  total_items: number;
  checked_items: number;
}

interface RecentAchievement {
  id: string;
  name: string;
  icon: string;
  tier: string;
  xp_reward: number;
  unlocked_at: string;
}

interface CrawlerData {
  profile: {
    crawler_name: string;
    total_xp: number;
    floor_number: number;
    login_streak: number;
    level: number;
    xp_progress: number;
    xp_to_next: number;
    xp_in_level: number;
    crawler_class: string | null;
  };
  stats: {
    achievement_count: number;
    unopened_boxes: number;
  };
  recent_xp: { action_type: string; amount: number; description: string }[];
  recent_achievements: RecentAchievement[];
}

interface TasksSummary {
  overdue: number;
  due_today: number;
  active: number;
  completed_today: number;
  due_this_week: number;
  in_progress: number;
}

interface ActivityEntry {
  id: string;
  performer: string;
  is_current_user: boolean;
  description: string;
  entity_type: string;
  action: string;
  created_at: string;
}

interface DashboardData {
  tasks_summary: TasksSummary;
  habits_summary: {
    active_count: number;
    checked_today: number;
    habits: DashboardHabit[];
  };
  streaks_leaderboard: { title: string; current_streak: number }[];
  recent_activity?: ActivityEntry[];
}

const CLASS_ICONS: Record<string, string> = {
  berserker: "⚔️", ranger: "🏹", scholar: "📖", paladin: "🛡️",
  monk: "🧘", artificer: "⚙️", warden: "🏠", unclassed: "❓",
};

const ACHIEVEMENT_TIER_STYLE: Record<string, string> = {
  common: "bg-dungeon-800 border-dungeon-700",
  uncommon: "bg-green-950/20 border-green-800/50",
  rare: "bg-blue-950/20 border-blue-800/50",
  epic: "bg-purple-950/20 border-purple-800/50",
  legendary: "bg-orange-950/20 border-orange-700/50",
};

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

const getWelcomeMessage = (displayName: string) => {
  const welcomeMessages = [
    `Welcome back, ${displayName}`,
    `The Command Deck awaits, ${displayName}`,
    `Good to see you again, ${displayName}`,
    `Back for more, ${displayName}?`,
    `The System missed you, ${displayName}`,
    `Ready to ride again, ${displayName}?`,
    `Another day in the wastes, ${displayName}`,
    `Welcome to your domain, ${displayName}`,
    `The crew's all here, ${displayName}`,
    `Time to make some moves, ${displayName}`,
    `Back in the saddle, ${displayName}?`,
    `Your command deck is loaded and ready, ${displayName}`,
  ];
  const today = new Date().toDateString();
  const hash = today.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return welcomeMessages[hash % welcomeMessages.length];
};

type DashView = "personal" | "household";

export default function DashboardPage() {
  const [displayName, setDisplayName] = useState("there");
  const [todayDate, setTodayDate] = useState("");
  const [crawler, setCrawler] = useState<CrawlerData | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [totalTaskCount, setTotalTaskCount] = useState<number | null>(null);
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [householdData, setHouseholdData] = useState<HouseholdData | null>(null);
  const [shoppingLists, setShoppingLists] = useState<ShoppingListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<DashView>("personal");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const userRes = await fetch("/api/user");
        if (userRes.ok) {
          const userData = await userRes.json();
          const u = userData.user || userData;
          setDisplayName(u.full_name || u.email || "there");
        }

        const [dashRes, allTasksRes, crawlRes, suggestionsRes, shoppingRes, householdRes] = await Promise.all([
          fetch("/api/dashboard"),
          fetch("/api/tasks?limit=1"),
          fetch("/api/gamification"),
          fetch("/api/ai/suggestions?status=pending&limit=3"),
          fetch("/api/shopping"),
          fetch("/api/dashboard/household"),
        ]);

        if (dashRes.ok) {
          const data = await dashRes.json();
          setDashData(data);
        }
        if (allTasksRes.ok) {
          const allData = await allTasksRes.json();
          setTotalTaskCount(allData.total ?? 0);
        }
        if (crawlRes.ok) setCrawler(await crawlRes.json());
        if (suggestionsRes.ok) {
          const sd = await suggestionsRes.json();
          setSuggestions(sd.suggestions || []);
        }
        if (shoppingRes.ok) {
          const sd = await shoppingRes.json();
          setShoppingLists(sd.lists || []);
        }
        if (householdRes.ok) {
          setHouseholdData(await householdRes.json());
        }

        setTodayDate(
          new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
        );
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <DashboardSkeleton />;

  const ts = dashData?.tasks_summary;
  const hs = dashData?.habits_summary;
  const streaks = dashData?.streaks_leaderboard || [];
  const totalShoppingItems = shoppingLists.reduce((a, l) => a + l.total_items, 0);

  // Status distribution for donut chart
  const statusCounts = ts ? {
    todo: Math.max(0, (ts.active || 0) - (ts.in_progress || 0)),
    inProgress: ts.in_progress || 0,
    overdue: ts.overdue || 0,
    done: ts.completed_today || 0,
  } : { todo: 0, inProgress: 0, overdue: 0, done: 0 };

  const statusTotal = statusCounts.todo + statusCounts.inProgress + statusCounts.overdue + statusCounts.done;

  // Build conic-gradient for donut chart
  const buildDonut = () => {
    if (statusTotal === 0) return "conic-gradient(#1e293b 0deg 360deg)";
    const segments: string[] = [];
    let offset = 0;
    const colors = [
      { count: statusCounts.overdue, color: "#ef4444" },
      { count: statusCounts.inProgress, color: "#3b82f6" },
      { count: statusCounts.todo, color: "#64748b" },
      { count: statusCounts.done, color: "#22c55e" },
    ];
    for (const { count, color } of colors) {
      if (count > 0) {
        const deg = (count / statusTotal) * 360;
        segments.push(`${color} ${offset}deg ${offset + deg}deg`);
        offset += deg;
      }
    }
    return `conic-gradient(${segments.join(", ")})`;
  };

  // Habits metrics
  const habitsChecked = hs?.checked_today || 0;
  const habitsTotal = hs?.active_count || 0;
  const habitsPct = habitsTotal > 0 ? Math.round((habitsChecked / habitsTotal) * 100) : 0;
  const longestStreak = streaks.length > 0 ? streaks[0] : null;
  const atRiskHabits = (hs?.habits || []).filter((h) => !h.checked_today && h.current_streak > 3);

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Greeting + View Toggle */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 dcc-heading tracking-wide">
              {getWelcomeMessage(displayName)}
            </h1>
            <p className="text-sm text-dungeon-500 mt-1 font-mono">{todayDate}</p>
          </div>
          {householdData && householdData.members.length > 1 && (
            <div className="flex gap-1 bg-dungeon-900 rounded-lg p-1 border border-dungeon-800">
              <button
                onClick={() => setView("personal")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === "personal"
                    ? "bg-dungeon-800 text-slate-100"
                    : "text-dungeon-400 hover:text-slate-200"
                }`}
              >
                Personal
              </button>
              <button
                onClick={() => setView("household")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === "household"
                    ? "bg-dungeon-800 text-slate-100"
                    : "text-dungeon-400 hover:text-slate-200"
                }`}
              >
                Household
              </button>
            </div>
          )}
        </div>

        {/* Setup nudge for new users with zero tasks */}
        {totalTaskCount === 0 && (
          <Link href="/welcome/setup" className="block">
            <div className="dcc-card-hover p-5 border-gold-800/40 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold-400 to-transparent opacity-60" />
              <div className="flex items-center gap-4">
                <span className="text-3xl">🏠</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-100">Set up your household</p>
                  <p className="text-xs text-dungeon-500 mt-0.5">Pick your rooms and pre-load common tasks in about a minute.</p>
                </div>
                <svg className="w-5 h-5 text-gold-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>
        )}

        {/* ── HOUSEHOLD VIEW ── */}
        {view === "household" && householdData && (
          <>
            {/* Household Combined Stats */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-100 dcc-heading tracking-wide">Household Pulse</h2>
              <div className="dcc-card p-5">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <MetricCell label="Combined Open" value={householdData.household.total_open} />
                  <MetricCell label="Overdue" value={householdData.household.total_overdue} accent="text-red-400" />
                  <MetricCell label="Done This Week" value={householdData.household.completed_this_week} accent="text-green-400" />
                  <MetricCell label="Habit Rate" value={householdData.household.habit_rate} accent={householdData.household.habit_rate >= 80 ? "text-green-400" : householdData.household.habit_rate >= 50 ? "text-amber-400" : "text-red-400"} />
                  <div className="text-center p-2 rounded-lg bg-dungeon-800/50">
                    <div className={`text-2xl font-bold font-mono ${
                      householdData.household.balance_status === "balanced" ? "text-green-400" :
                      householdData.household.balance_status === "slightly_off" ? "text-amber-400" : "text-red-400"
                    }`}>
                      {householdData.household.balance_status === "balanced" ? "=" :
                       householdData.household.balance_status === "slightly_off" ? "~" : "!"}
                    </div>
                    <div className="text-[10px] text-dungeon-500 font-semibold uppercase tracking-wider mt-1">
                      Balance
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Per-Member Cards */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-100 dcc-heading tracking-wide">Members</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {householdData.members.map((member) => (
                  <div key={member.id} className={`dcc-card p-5 ${member.is_current_user ? "border-amber-600/30" : ""}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                        member.is_current_user ? "bg-amber-600/20 text-amber-400" : "bg-dungeon-800 text-slate-300"
                      }`}>
                        {member.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-100">
                          {member.name} {member.is_current_user && <span className="text-dungeon-500 font-normal">(you)</span>}
                        </p>
                        {member.crawler && (
                          <p className="text-xs text-dungeon-500 font-mono">Lv.{member.crawler.level} — {member.crawler.xp.toLocaleString()} XP</p>
                        )}
                      </div>
                    </div>

                    {/* Task metrics */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="text-center p-1.5 rounded bg-dungeon-800/40">
                        <div className="text-lg font-bold font-mono text-slate-100">{member.tasks.open}</div>
                        <div className="text-[9px] text-dungeon-500 uppercase">Open</div>
                      </div>
                      <div className="text-center p-1.5 rounded bg-dungeon-800/40">
                        <div className={`text-lg font-bold font-mono ${member.tasks.overdue > 0 ? "text-red-400" : "text-slate-100"}`}>
                          {member.tasks.overdue}
                        </div>
                        <div className="text-[9px] text-dungeon-500 uppercase">Overdue</div>
                      </div>
                      <div className="text-center p-1.5 rounded bg-dungeon-800/40">
                        <div className="text-lg font-bold font-mono text-green-400">{member.tasks.completed_this_week}</div>
                        <div className="text-[9px] text-dungeon-500 uppercase">Done/wk</div>
                      </div>
                    </div>

                    {/* Habit progress */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-dungeon-400">Habits</span>
                          <span className="text-slate-200 font-mono">{member.habits.checked_today}/{member.habits.total}</span>
                        </div>
                        <div className="w-full h-2 bg-dungeon-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${member.habits.rate >= 80 ? "bg-green-500" : member.habits.rate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${member.habits.rate}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-bold font-mono text-slate-200">{member.habits.rate}%</span>
                    </div>

                    {/* Top streaks */}
                    {member.habits.top_streaks.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {member.habits.top_streaks.map((s, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-dungeon-800 border border-dungeon-700 text-amber-400 font-mono">
                            {s.title} {s.streak}d
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Weekly Trend Sparkline */}
            {householdData.weekly_trend.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-100 dcc-heading tracking-wide">This Week</h2>
                <div className="dcc-card p-5">
                  <div className="grid grid-cols-7 gap-1">
                    {householdData.weekly_trend.map((day) => {
                      const dayName = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
                      return (
                        <div key={day.date} className="text-center">
                          <div className="text-[9px] text-dungeon-500 mb-1">{dayName}</div>
                          <div className={`text-xs font-bold font-mono ${day.tasks > 0 ? "text-green-400" : "text-dungeon-600"}`}>
                            {day.tasks}
                          </div>
                          <div className="text-[9px] text-dungeon-500">tasks</div>
                          <div className="w-full h-1.5 bg-dungeon-800 rounded-full mt-1 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${day.habits_rate >= 80 ? "bg-green-500" : day.habits_rate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                              style={{ width: `${day.habits_rate}%` }}
                            />
                          </div>
                          <div className="text-[8px] text-dungeon-600 mt-0.5 font-mono">+{day.xp}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* ── PERSONAL VIEW ── */}
        {/* Crawler Status Card */}
        {view === "personal" && crawler && (
          <div className="space-y-3">
            <Link href="/crawl" className="block">
              <div className="dcc-card-hover p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-crimson-500 to-transparent opacity-60" />
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full border-2 border-crimson-600 flex items-center justify-center bg-dungeon-950">
                      <span className="text-lg font-bold text-crimson-400 font-mono">{crawler.profile.level}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-100 font-bold">{crawler.profile.crawler_name || displayName}</span>
                        {crawler.profile.crawler_class && crawler.profile.crawler_class !== "unclassed" && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-dungeon-800 border border-dungeon-700 text-slate-300 font-mono capitalize">
                            {CLASS_ICONS[crawler.profile.crawler_class] || ""} {crawler.profile.crawler_class}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-dungeon-500 font-mono">Floor {crawler.profile.floor_number} — Level {crawler.profile.level}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-crimson-400 font-mono">{crawler.profile.total_xp.toLocaleString()} XP</div>
                    <div className="flex items-center gap-3 justify-end">
                      {crawler.profile.login_streak > 1 && (
                        <span className="text-xs text-gold-400 font-mono">🔥 {crawler.profile.login_streak}d</span>
                      )}
                      {crawler.stats?.achievement_count > 0 && (
                        <span className="text-xs text-dungeon-500 font-mono">🏆 {crawler.stats.achievement_count}</span>
                      )}
                      {crawler.stats?.unopened_boxes > 0 && (
                        <span className="text-xs text-gold-400 font-mono">📦 {crawler.stats.unopened_boxes}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="dcc-xp-bar">
                  <div className="dcc-xp-fill" style={{ width: `${Math.min(crawler.profile.xp_progress || 0, 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-dungeon-500 mt-1 font-mono">
                  <span>Level {crawler.profile.level}</span>
                  <span>{(crawler.profile.xp_to_next || 0).toLocaleString()} XP to next</span>
                </div>
              </div>
            </Link>

            {/* Recent Achievements Showcase */}
            {crawler.recent_achievements && crawler.recent_achievements.length > 0 && (
              <div className="dcc-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-dungeon-500 uppercase tracking-wider font-mono">Recent Achievements</h3>
                  <Link href="/crawl?tab=achievements" className="text-xs text-crimson-400 hover:text-crimson-300 transition-colors font-mono">
                    View all &rarr;
                  </Link>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {crawler.recent_achievements.slice(0, 4).map(a => (
                    <div
                      key={a.id}
                      className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-lg border ${ACHIEVEMENT_TIER_STYLE[a.tier] || ACHIEVEMENT_TIER_STYLE.common}`}
                    >
                      <span className="text-xl">{a.icon || "🏆"}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">{a.name}</p>
                        <p className="text-[10px] text-dungeon-500 font-mono">+{a.xp_reward} XP</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent XP Activity */}
        {view === "personal" && crawler && crawler.recent_xp && crawler.recent_xp.length > 0 && (
          <div className="dcc-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-dungeon-500 uppercase tracking-wider font-mono">Recent XP</h3>
              <Link href="/crawl" className="text-xs text-crimson-400 hover:text-crimson-300 transition-colors font-mono">
                Full log &rarr;
              </Link>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {crawler.recent_xp.slice(0, 6).map((xp, i) => (
                <div key={i} className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-dungeon-800/60 border border-dungeon-700/50">
                  <span className="text-xs font-bold text-green-400 font-mono">+{xp.amount}</span>
                  <span className="text-[10px] text-dungeon-500 truncate max-w-[120px]">{xp.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outcomes Panel */}
        {view === "personal" && <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-4 dcc-heading tracking-wide">Your Outcomes</h2>
          <OutcomesPanel data={dashData} />
        </section>}

        {/* AI Suggestions */}
        {view === "personal" && suggestions.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100 dcc-heading tracking-wide">Zev&apos;s Intel</h2>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div key={s.id} className="dcc-card-gold p-4 flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">
                    {s.category === "habit_adjustment" ? "🔄" :
                     s.category === "goal_suggestion" ? "🎯" :
                     s.category === "financial_insight" ? "💰" :
                     s.category === "schedule_optimization" ? "📅" :
                     s.category === "delegation_suggestion" ? "👥" : "💡"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-100">{s.title}</div>
                    <div className="text-xs text-dungeon-500 mt-1 line-clamp-2">{s.description}</div>
                  </div>
                  <div className="flex-shrink-0">
                    <span className="dcc-badge-muted font-mono">{Math.round(s.confidence * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Task Metrics Card */}
        {view === "personal" && ts && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100 dcc-heading tracking-wide">Task Overview</h2>
              <Link href="/tasks" className="text-xs text-dungeon-500 hover:text-crimson-400 transition-colors font-mono">
                Open board &rarr;
              </Link>
            </div>
            <div className="dcc-card p-5">
              <div className="flex gap-6 items-center">
                {/* Metrics grid */}
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  <Link href="/tasks?due=today" className="block">
                    <MetricCell label="Due Today" value={ts.due_today} />
                  </Link>
                  <Link href="/tasks?due=overdue" className="block">
                    <MetricCell label="Overdue" value={ts.overdue} accent="text-red-400" />
                  </Link>
                  <Link href="/tasks?due=this_week" className="block">
                    <MetricCell label="This Week" value={ts.due_this_week} />
                  </Link>
                  <Link href="/tasks?status=In Progress" className="block">
                    <MetricCell label="In Progress" value={ts.in_progress} accent="text-blue-400" />
                  </Link>
                  <Link href="/tasks?status=Done" className="block">
                    <MetricCell label="Done Today" value={ts.completed_today} accent="text-green-400" />
                  </Link>
                </div>

                {/* Status donut chart */}
                {statusTotal > 0 && (
                  <div className="flex-shrink-0 hidden sm:block">
                    <div className="relative w-20 h-20">
                      <div
                        className="w-full h-full rounded-full"
                        style={{
                          background: buildDonut(),
                          mask: "radial-gradient(circle at center, transparent 55%, black 56%)",
                          WebkitMask: "radial-gradient(circle at center, transparent 55%, black 56%)",
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-bold text-slate-100 font-mono">{ts.active}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 justify-center">
                      <Legend color="bg-red-500" label="Overdue" />
                      <Legend color="bg-blue-500" label="Active" />
                      <Legend color="bg-slate-500" label="To Do" />
                      <Legend color="bg-green-500" label="Done" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Habit Metrics Card */}
        {view === "personal" && hs && habitsTotal > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100 dcc-heading tracking-wide">Habits</h2>
              <Link href="/habits" className="text-xs text-dungeon-500 hover:text-crimson-400 transition-colors font-mono">
                View all &rarr;
              </Link>
            </div>
            <Link href="/habits" className="block">
              <div className="dcc-card-hover p-5">
                <div className="flex items-center gap-6">
                  {/* Completion ring */}
                  <div className="flex-shrink-0 relative w-20 h-20">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1e293b" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.5" fill="none"
                        stroke={habitsPct === 100 ? "#22c55e" : "#dc2626"}
                        strokeWidth="3"
                        strokeDasharray={`${habitsPct} ${100 - habitsPct}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold text-slate-100 font-mono">{habitsChecked}/{habitsTotal}</span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-2">
                    <p className="text-sm text-slate-200">
                      <span className="font-bold text-lg text-slate-100 font-mono">{habitsPct}%</span>
                      <span className="text-dungeon-500 ml-2">complete today</span>
                    </p>

                    {longestStreak && (
                      <p className="text-xs text-dungeon-500">
                        Longest active streak: <span className="text-amber-400 font-medium">{longestStreak.title}</span> at <span className="text-amber-400 font-mono">{longestStreak.current_streak}d</span>
                      </p>
                    )}

                    {atRiskHabits.length > 0 && (
                      <p className="text-xs text-red-400">
                        At risk: {atRiskHabits.map((h) => h.title).join(", ")} ({atRiskHabits.length} streak{atRiskHabits.length > 1 ? "s" : ""} in danger)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* Shopping Summary */}
        {view === "personal" && shoppingLists.length > 0 && (
          <Link href="/shopping" className="block">
            <div className="dcc-card-hover p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">🛒</span>
                <span className="text-sm text-slate-200 font-medium">
                  {totalShoppingItems} item{totalShoppingItems !== 1 ? "s" : ""} across {shoppingLists.length} list{shoppingLists.length !== 1 ? "s" : ""}
                </span>
              </div>
              <svg className="w-4 h-4 text-dungeon-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        )}

        {/* Household Activity Feed */}
        {view === "personal" && dashData?.recent_activity && dashData.recent_activity.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100 dcc-heading tracking-wide">Recent Activity</h2>
            <div className="dcc-card p-4 space-y-1">
              {dashData.recent_activity.slice(0, 8).map(entry => (
                <div key={entry.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-sm flex-shrink-0">
                    {entry.entity_type === "task" && entry.action === "completed" ? "✅" :
                     entry.entity_type === "task" ? "📋" :
                     entry.entity_type === "habit_check_in" ? "🔄" :
                     entry.entity_type === "goal" && entry.action === "completed" ? "🏆" :
                     entry.entity_type === "goal" ? "🎯" : "📝"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${entry.is_current_user ? "text-dungeon-400" : "text-slate-200 font-medium"}`}>
                      {entry.performer}
                    </span>
                    <span className="text-sm text-dungeon-500"> {entry.description}</span>
                  </div>
                  <span className="text-[10px] text-dungeon-600 font-mono flex-shrink-0">
                    {formatTimeAgo(entry.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <QuickActionButton href="/chat" icon="💬" label="Ask Zev" />
          <QuickActionButton href="/crawl" icon="🗡️" label="The Crawl" />
          <QuickActionButton href="/goals" icon="🎯" label="War Room" />
          <QuickActionButton href="/habits" icon="🔄" label="Training" />
          <QuickActionButton href="/tasks" icon="📋" label="Task Board" />
        </div>

        {error && (
          <div className="dcc-card-system p-4">
            <p className="text-crimson-400 text-sm font-mono">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="text-center p-2 rounded-lg bg-dungeon-800/50 hover:bg-dungeon-800 transition-colors">
      <div className={`text-2xl font-bold font-mono ${accent || "text-slate-100"}`}>
        {value}
      </div>
      <div className="text-[10px] text-dungeon-500 font-semibold uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[9px] text-dungeon-500">{label}</span>
    </div>
  );
}

function QuickActionButton({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="dcc-card-hover flex items-center gap-3 p-4 active:scale-95"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-slate-100 font-medium text-sm">{label}</span>
      <svg className="w-4 h-4 text-dungeon-600 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
