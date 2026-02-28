"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OutcomesPanel from "@/components/dashboard/OutcomesPanel";

interface Task {
  id: string;
  title: string;
  due_date: string;
  priority: string;
}

interface Suggestion {
  id: string;
  category: string;
  title: string;
  description: string;
  priority: number;
  confidence: number;
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
  recentXp: { action_type: string; xp_amount: number; description: string }[];
}

export default function DashboardPage() {
  const [displayName, setDisplayName] = useState("there");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [todayDate, setTodayDate] = useState("");
  const [crawler, setCrawler] = useState<CrawlerData | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const userRes = await fetch("/api/user");
        if (userRes.ok) {
          const userData = await userRes.json();
          setDisplayName(userData.full_name || userData.email || "there");
        }

        const tasksRes = await fetch("/api/tasks?due_today=true&limit=5");
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          const parsedTasks = Array.isArray(tasksData) ? tasksData : tasksData.tasks || [];
          setTasks(parsedTasks);
        }

        const crawlRes = await fetch("/api/gamification");
        if (crawlRes.ok) {
          const crawlData = await crawlRes.json();
          setCrawler(crawlData);
        }

        const suggestionsRes = await fetch("/api/ai/suggestions?status=pending&limit=3");
        if (suggestionsRes.ok) {
          const suggestionsData = await suggestionsRes.json();
          setSuggestions(suggestionsData.suggestions || []);
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
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-dungeon-500 font-mono text-sm">Loading systems...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-3xl font-bold text-slate-100 dcc-heading tracking-wide">
            Welcome back, {displayName}
          </h1>
          <p className="text-sm text-dungeon-500 mt-1 font-mono">{todayDate}</p>
        </div>

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
                  {task.priority && (
                    <span
                      className={`text-xs px-2 py-1 rounded font-mono ${
                        task.priority === "high"
                          ? "bg-crimson-900/30 text-crimson-400 border border-crimson-800"
                          : task.priority === "medium"
                          ? "bg-gold-900/30 text-gold-400 border border-gold-800"
                          : "bg-dungeon-800 text-dungeon-500 border border-dungeon-700"
                      }`}
                    >
                      {task.priority}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="dcc-card p-6 text-center">
              <p className="text-dungeon-500 text-sm font-mono">No tasks due today. The System is suspicious of your productivity.</p>
            </div>
          )}
        </section>

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
