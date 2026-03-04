"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OutcomesPanel from "@/components/dashboard/OutcomesPanel";
import { DashboardSkeleton } from "@/components/ui/Skeleton";

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

interface CrawlerData {
  profile: {
    crawler_name: string;
    total_xp: number;
    current_floor: number;
    login_streak: number;
  };
  level: {
    level: number;
    xpToNext: number;
    xpInLevel: number;
    progress: number;
  };
  recentXp: { action_type: string; amount: number; description: string }[];
}

interface TasksSummary {
  overdue: number;
  due_today: number;
  active: number;
  completed_today: number;
  due_this_week: number;
  in_progress: number;
}

interface DashboardData {
  tasks_summary: TasksSummary;
  habits_summary: {
    active_count: number;
    checked_today: number;
    habits: DashboardHabit[];
  };
  streaks_leaderboard: { title: string; current_streak: number }[];
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

export default function DashboardPage() {
  const [displayName, setDisplayName] = useState("there");
  const [todayDate, setTodayDate] = useState("");
  const [crawler, setCrawler] = useState<CrawlerData | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [totalTaskCount, setTotalTaskCount] = useState<number | null>(null);
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [shoppingLists, setShoppingLists] = useState<ShoppingListSummary[]>([]);
  const [loading, setLoading] = useState(true);
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

        const [dashRes, allTasksRes, crawlRes, suggestionsRes, shoppingRes] = await Promise.all([
          fetch("/api/dashboard"),
          fetch("/api/tasks?limit=1"),
          fetch("/api/gamification"),
          fetch("/api/ai/suggestions?status=pending&limit=3"),
          fetch("/api/shopping"),
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
        {/* Greeting */}
        <div>
          <h1 className="text-3xl font-bold text-slate-100 dcc-heading tracking-wide">
            {getWelcomeMessage(displayName)}
          </h1>
          <p className="text-sm text-dungeon-500 mt-1 font-mono">{todayDate}</p>
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

        {/* Crawler Status Card */}
        {crawler && (
          <Link href="/crawl" className="block">
            <div className="dcc-card-hover p-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-crimson-500 to-transparent opacity-60" />
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full border-2 border-crimson-600 flex items-center justify-center bg-dungeon-950">
                    <span className="text-lg font-bold text-crimson-400 font-mono">{crawler.level.level}</span>
                  </div>
                  <div>
                    <div className="text-slate-100 font-bold">{crawler.profile.crawler_name || displayName}</div>
                    <div className="text-xs text-dungeon-500 font-mono">Floor {crawler.profile.current_floor} — Level {crawler.level.level}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-crimson-400 font-mono">{crawler.profile.total_xp.toLocaleString()} XP</div>
                  {crawler.profile.login_streak > 1 && (
                    <div className="text-xs text-gold-400 font-mono">🔥 {crawler.profile.login_streak}-day streak</div>
                  )}
                </div>
              </div>
              <div className="dcc-xp-bar">
                <div className="dcc-xp-fill" style={{ width: `${Math.min(crawler.level.progress, 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-dungeon-500 mt-1 font-mono">
                <span>Level {crawler.level.level}</span>
                <span>{crawler.level.xpToNext.toLocaleString()} XP to next</span>
              </div>
            </div>
          </Link>
        )}

        {/* Outcomes Panel */}
        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-4 dcc-heading tracking-wide">Your Outcomes</h2>
          <OutcomesPanel />
        </section>

        {/* AI Suggestions */}
        {suggestions.length > 0 && (
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
        {ts && (
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
                <div className="flex-1 grid grid-cols-3 sm:grid-cols-5 gap-3">
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
        {hs && habitsTotal > 0 && (
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
        {shoppingLists.length > 0 && (
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

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
    <div className="text-center p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors">
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
      <span className="text-[9px] text-slate-500">{label}</span>
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
