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

export default function DashboardPage() {
  const [displayName, setDisplayName] = useState("there");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [todayDate, setTodayDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get user data and today's tasks
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch user profile
        const userRes = await fetch("/api/user");
        if (userRes.ok) {
          const userData = await userRes.json();
          setDisplayName(userData.full_name || userData.email || "there");
        }

        // Fetch today's tasks
        const tasksRes = await fetch("/api/tasks?due_today=true&limit=5");
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          const parsedTasks = Array.isArray(tasksData) ? tasksData : tasksData.tasks || [];
          setTasks(parsedTasks);
        }

        // Set today's date
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
          <div className="text-slate-400">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-3xl font-bold text-slate-100">
            Welcome back, {displayName}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{todayDate}</p>
        </div>

        {/* Primary: Outcomes Panel */}
        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Your Outcomes</h2>
          <OutcomesPanel />
        </section>

        {/* Today's Tasks Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Today's Tasks</h2>
            <Link
              href="/tasks"
              className="text-xs text-slate-400 hover:text-slate-100 transition-colors"
            >
              View all
            </Link>
          </div>

          {tasks.length > 0 ? (
            <div className="space-y-2 bg-slate-900 rounded-xl border border-slate-800 p-5">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between py-2.5 border-b border-slate-800 last:border-0"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-4 h-4 rounded border border-slate-600 bg-slate-800" />
                    <span className="text-sm text-slate-300">{task.title}</span>
                  </div>
                  {task.priority && (
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        task.priority === "high"
                          ? "bg-red-900/30 text-red-400"
                          : task.priority === "medium"
                          ? "bg-amber-900/30 text-amber-400"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {task.priority}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 text-center">
              <p className="text-slate-400 text-sm">No tasks due today. Great job staying on top of things!</p>
            </div>
          )}
        </section>

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <QuickActionButton
            href="/goals"
            icon="🎯"
            label="Goals"
          />
          <QuickActionButton
            href="/habits"
            icon="🔄"
            label="Habits"
          />
          <QuickActionButton
            href="/tasks"
            icon="📋"
            label="Tasks"
          />
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-400 text-sm">{error}</p>
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
      className="flex items-center gap-3 p-4 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800/50 hover:border-slate-700 transition-all active:scale-95"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-slate-100 font-medium">{label}</span>
      <svg className="w-5 h-5 text-slate-500 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
