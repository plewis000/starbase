"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OutcomesPanel from "@/components/dashboard/OutcomesPanel";
import { DashboardSkeleton } from "@/components/ui/Skeleton";

interface Task {
  id: string;
  title: string;
  due_date: string;
  priority: { name: string; display_color?: string } | string | null;
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

// Fun welcome message variations for the command deck
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

  // Use a simple hash of the current day to get consistent but rotating messages
  const today = new Date().toDateString();
  const hash = today.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return welcomeMessages[hash % welcomeMessages.length];
};

export default function DashboardPage() {
  const [displayName, setDisplayName] = useState("there");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [todayDate, setTodayDate] = useState("");
  const [crawler, setCrawler] = useState<CrawlerData | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [totalTaskCount, setTotalTaskCount] = useState<number | null>(null);
  const [habits, setHabits] = useState<DashboardHabit[]>([]);
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

        const [tasksRes, allTasksRes] = await Promise.all([
          fetch("/api/tasks?due_today=true&limit=5"),
          fetch("/api/tasks?limit=1"),
        ]);
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          const parsedTasks = Array.isArray(tasksData) ? tasksData : tasksData.tasks || [];
          setTasks(parsedTasks);
        }
        if (allTasksRes.ok) {
          const allData = await allTasksRes.json();
          setTotalTaskCount(allData.total ?? 0);
        }

        const crawlRes = await fetch("/api/gamification");
        if (crawlRes.ok) {
          const crawlData = await crawlRes.json();
          setCrawler(crawlData);
        }

        const [suggestionsRes, habitsRes, shoppingRes] = await Promise.all([
          fetch("/api/ai/suggestions?status=pending&limit=3"),
          fetch("/api/habits?status=active&limit=10"),
          fetch("/api/shopping"),
        ]);
        if (suggestionsRes.ok) {
          const suggestionsData = await suggestionsRes.json();
          setSuggestions(suggestionsData.suggestions || []);
        }
        if (habitsRes.ok) {
          const habitsData = await habitsRes.json();
          setHabits(habitsData.habits || []);
        }
        if (shoppingRes.ok) {
          const shoppingData = await shoppingRes.json();
          setShoppingLists(shoppingData.lists || []);
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

  if (loading) {
    return <DashboardSkeleton />;
  }

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
              {/* Subtle crimson glow accent */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-crimson-500 to-transparent opacity-60" />

              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full border-2 border-crimson-600 flex items-center justify-center bg-dungeon-950">
                    <span className="text-lg font-bold text-crimson-400 font-mono">
                      {crawler.level.level}
                    </span>
                  </div>
                  <div>
                    <div className="text-slate-100 font-bold">
                      {crawler.profile.crawler_name || displayName}
                    </div>
                    <div className="text-xs text-dungeon-500 font-mono">
                      Floor {crawler.profile.current_floor} — Level {crawler.level.level}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-crimson-400 font-mono">
                    {crawler.profile.total_xp.toLocaleString()} XP
                  </div>
                  {crawler.profile.login_streak > 1 && (
                    <div className="text-xs text-gold-400 font-mono">
                      🔥 {crawler.profile.login_streak}-day streak
                    </div>
                  )}
                </div>
              </div>
              {/* XP Progress Bar */}
              <div className="dcc-xp-bar">
                <div
                  className="dcc-xp-fill"
                  style={{ width: `${Math.min(crawler.level.progress, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-dungeon-500 mt-1 font-mono">
                <span>Level {crawler.level.level}</span>
                <span>{crawler.level.xpToNext.toLocaleString()} XP to next</span>
              </div>
            </div>
          </Link>
        )}

        {/* Primary: Outcomes Panel */}
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
                <div
                  key={s.id}
                  className="dcc-card-gold p-4 flex items-start gap-3"
                >
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
                    <span className="dcc-badge-muted font-mono">
                      {Math.round(s.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Today's Tasks Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100 dcc-heading tracking-wide">Today&apos;s Tasks</h2>
            <Link
              href="/tasks"
              className="text-xs text-dungeon-500 hover:text-crimson-400 transition-colors font-mono"
            >
              View all &rarr;
            </Link>
          </div>

          {tasks.length > 0 ? (
            <div className="dcc-card p-5 space-y-0">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between py-2.5 border-b border-dungeon-700 last:border-0"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-4 h-4 rounded border border-dungeon-600 bg-dungeon-800" />
                    <span className="text-sm text-slate-300">{task.title}</span>
                  </div>
                  {task.priority && (() => {
                    const pName = typeof task.priority === "string" ? task.priority : task.priority?.name || "";
                    const pLower = pName.toLowerCase();
                    return (
                      <span
                        className={`text-xs px-2 py-1 rounded font-mono ${
                          pLower === "high" || pLower === "critical"
                            ? "bg-crimson-900/30 text-crimson-400 border border-crimson-800"
                            : pLower === "medium"
                            ? "bg-gold-900/30 text-gold-400 border border-gold-800"
                            : "bg-dungeon-800 text-dungeon-500 border border-dungeon-700"
                        }`}
                      >
                        {pName}
                      </span>
                    );
                  })()}
                </div>
              ))}
            </div>
          ) : (
            <div className="dcc-card p-6 text-center space-y-3">
              <p className="text-dungeon-500 text-sm font-mono">No tasks due today.</p>
              <Link
                href="/tasks"
                className="inline-block px-4 py-2 text-sm font-medium text-crimson-400 border border-crimson-800 rounded-lg hover:bg-crimson-900/20 transition-colors font-mono"
              >
                Add a task &rarr;
              </Link>
            </div>
          )}
        </section>

        {/* Today's Habits */}
        {habits.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100 dcc-heading tracking-wide">Today&apos;s Habits</h2>
              <Link
                href="/habits"
                className="text-xs text-dungeon-500 hover:text-crimson-400 transition-colors font-mono"
              >
                View all &rarr;
              </Link>
            </div>
            <div className="dcc-card p-4">
              {/* Progress summary */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-300">
                  {habits.filter((h) => h.checked_today).length}/{habits.length} done
                </span>
                <span className="text-sm font-bold text-crimson-400 font-mono">
                  {habits.length > 0
                    ? Math.round((habits.filter((h) => h.checked_today).length / habits.length) * 100)
                    : 0}%
                </span>
              </div>
              <div className="w-full bg-dungeon-800 rounded-full h-1.5 mb-3">
                <div
                  className="bg-crimson-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${habits.length > 0 ? (habits.filter((h) => h.checked_today).length / habits.length) * 100 : 0}%` }}
                />
              </div>
              {/* Habit list — unchecked first */}
              <div className="space-y-1">
                {[...habits].sort((a, b) => (a.checked_today ? 1 : 0) - (b.checked_today ? 1 : 0)).slice(0, 6).map((habit) => (
                  <div key={habit.id} className="flex items-center gap-3 py-1.5">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      habit.checked_today
                        ? "border-crimson-400 bg-crimson-400/20"
                        : "border-dungeon-600"
                    }`}>
                      {habit.checked_today && (
                        <svg className="w-2.5 h-2.5 text-crimson-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm flex-1 ${habit.checked_today ? "text-dungeon-500 line-through" : "text-slate-300"}`}>
                      {habit.title}
                    </span>
                    {habit.current_streak > 0 && (
                      <span className="text-xs text-amber-400 font-mono">🔥{habit.current_streak}</span>
                    )}
                  </div>
                ))}
                {habits.length > 6 && (
                  <Link href="/habits" className="block text-xs text-dungeon-500 hover:text-crimson-400 transition-colors pt-1 font-mono">
                    +{habits.length - 6} more &rarr;
                  </Link>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Shopping Lists */}
        {shoppingLists.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100 dcc-heading tracking-wide">Shopping</h2>
              <Link
                href="/shopping"
                className="text-xs text-dungeon-500 hover:text-crimson-400 transition-colors font-mono"
              >
                View all &rarr;
              </Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {shoppingLists.slice(0, 4).map((list) => {
                const remaining = list.total_items - list.checked_items;
                const pct = list.total_items > 0 ? Math.round((list.checked_items / list.total_items) * 100) : 0;
                return (
                  <Link key={list.id} href="/shopping" className="block">
                    <div className="dcc-card-hover p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-200 truncate">{list.name}</span>
                        <span className="text-xs text-dungeon-500 font-mono flex-shrink-0 ml-2">
                          {remaining > 0 ? `${remaining} left` : "Done!"}
                        </span>
                      </div>
                      <div className="w-full bg-dungeon-800 rounded-full h-1">
                        <div
                          className={`h-1 rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-crimson-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
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
