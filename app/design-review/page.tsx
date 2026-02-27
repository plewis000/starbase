"use client";

import React, { useState } from "react";

// ============================================================
// MOCK DATA
// ============================================================
const MOCK_TASKS = [
  { id: "1", title: "Review Q1 budget projections", status: "in_progress", priority: "high", assignee: "Parker", dueDate: "2026-02-28", tags: ["Finance", "Q1"], checklist: { done: 3, total: 5 } },
  { id: "2", title: "Fix auth token refresh on mobile", status: "todo", priority: "critical", assignee: "Parker", dueDate: "2026-02-27", tags: ["Bug", "Auth"], checklist: { done: 0, total: 3 } },
  { id: "3", title: "Design shopping list share flow", status: "todo", priority: "medium", assignee: null, dueDate: "2026-03-05", tags: ["Design"], checklist: null },
  { id: "4", title: "Write migration for habit categories", status: "done", priority: "low", assignee: "Parker", dueDate: null, tags: ["Backend"], checklist: { done: 4, total: 4 } },
  { id: "5", title: "Set up Discord webhook for goal milestones", status: "todo", priority: "medium", assignee: null, dueDate: "2026-03-10", tags: ["Integration"], checklist: null },
];

const MOCK_HABITS = [
  { id: "1", title: "Read 30 min", streak: 14, checked: true, icon: "📖", color: "#a78bfa" },
  { id: "2", title: "Exercise", streak: 7, checked: true, icon: "💪", color: "#34d399" },
  { id: "3", title: "Meditate", streak: 3, checked: false, icon: "🧘", color: "#60a5fa" },
  { id: "4", title: "Journal", streak: 21, checked: true, icon: "📝", color: "#fbbf24" },
  { id: "5", title: "No sugar", streak: 5, checked: false, icon: "🚫", color: "#f87171" },
  { id: "6", title: "Walk 10k steps", streak: 0, checked: false, icon: "🚶", color: "#2dd4bf" },
];

const MOCK_GOALS = [
  { id: "1", title: "Read 24 books this year", progress: 42, target: "24 books", current: "10 books", status: "active", habits: ["Read 30 min"], milestones: [{ title: "Finish 6", done: true }, { title: "Finish 12", done: false }, { title: "Finish 18", done: false }, { title: "Finish 24", done: false }] },
  { id: "2", title: "Run a half marathon", progress: 65, target: "13.1 mi", current: "8.5 mi", status: "active", habits: ["Exercise"], milestones: [{ title: "5K", done: true }, { title: "10K", done: true }, { title: "Half", done: false }] },
  { id: "3", title: "Save $10,000 emergency fund", progress: 78, target: "$10,000", current: "$7,800", status: "active", habits: [], milestones: [] },
];

const MOCK_BUDGETS = [
  { category: "Groceries", icon: "🛒", spent: 312, budget: 450, color: "#34d399" },
  { category: "Dining Out", icon: "🍽️", spent: 180, budget: 200, color: "#fbbf24" },
  { category: "Gas", icon: "⛽", spent: 95, budget: 150, color: "#60a5fa" },
  { category: "Entertainment", icon: "🎮", spent: 67, budget: 100, color: "#a78bfa" },
  { category: "Shopping", icon: "🛍️", spent: 245, budget: 200, color: "#f87171" },
];

// Generate habit heatmap data (last 16 weeks)
const generateHeatmap = () => {
  const data: number[][] = [];
  for (let week = 0; week < 16; week++) {
    const weekData: number[] = [];
    for (let day = 0; day < 7; day++) {
      const rand = Math.random();
      weekData.push(rand < 0.15 ? 0 : rand < 0.35 ? 1 : rand < 0.6 ? 2 : 3);
    }
    data.push(weekData);
  }
  return data;
};
const HEATMAP_DATA = generateHeatmap();

const STATUS_ICONS: Record<string, { color: string; icon: string }> = {
  todo: { color: "text-slate-400", icon: "○" },
  in_progress: { color: "text-blue-400", icon: "◐" },
  done: { color: "text-green-400", icon: "●" },
  blocked: { color: "text-red-400", icon: "⊘" },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-500",
  high: "text-amber-500",
  medium: "text-blue-400",
  low: "text-slate-400",
};

const ACCENT_THEMES = [
  { name: "Emerald", accent: "green", bg: "bg-green-400", text: "text-green-400", ring: "ring-green-400", border: "border-green-400", bgMuted: "bg-green-400/10", sample: "#4ade80" },
  { name: "Indigo", accent: "indigo", bg: "bg-indigo-400", text: "text-indigo-400", ring: "ring-indigo-400", border: "border-indigo-400", bgMuted: "bg-indigo-400/10", sample: "#818cf8" },
  { name: "Amber", accent: "amber", bg: "bg-amber-400", text: "text-amber-400", ring: "ring-amber-400", border: "border-amber-400", bgMuted: "bg-amber-400/10", sample: "#fbbf24" },
  { name: "Rose", accent: "rose", bg: "bg-rose-400", text: "text-rose-400", ring: "ring-rose-400", border: "border-rose-400", bgMuted: "bg-rose-400/10", sample: "#fb7185" },
  { name: "Cyan", accent: "cyan", bg: "bg-cyan-400", text: "text-cyan-400", ring: "ring-cyan-400", border: "border-cyan-400", bgMuted: "bg-cyan-400/10", sample: "#22d3ee" },
  { name: "Violet", accent: "violet", bg: "bg-violet-400", text: "text-violet-400", ring: "ring-violet-400", border: "border-violet-400", bgMuted: "bg-violet-400/10", sample: "#a78bfa" },
];

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

// ============================================================
// SECTION WRAPPER
// ============================================================
function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100">{title}</h2>
        <p className="text-sm text-slate-400 mt-1">{description}</p>
      </div>
      {children}
    </div>
  );
}

function VariantLabel({ name, inspiration, children }: { name: string; inspiration: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-100">{name}</h3>
        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{inspiration}</span>
      </div>
      {children}
    </div>
  );
}

// ============================================================
// 1. TASK CARD VARIANTS
// ============================================================
function TaskCardsLinear() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {MOCK_TASKS.map((task) => (
        <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/50 transition-colors border-b border-slate-800/50 last:border-0 group cursor-pointer">
          <span className={`text-sm ${STATUS_ICONS[task.status]?.color || "text-slate-400"}`}>
            {STATUS_ICONS[task.status]?.icon || "○"}
          </span>
          <span className={`text-sm flex-1 truncate ${task.status === "done" ? "text-slate-500 line-through" : "text-slate-100"}`}>
            {task.title}
          </span>
          <div className="flex items-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
            {task.priority && (
              <span className={`text-xs ${PRIORITY_COLORS[task.priority]}`}>
                {task.priority === "critical" ? "!!!" : task.priority === "high" ? "!!" : task.priority === "medium" ? "!" : ""}
              </span>
            )}
            {task.tags.slice(0, 1).map((tag) => (
              <span key={tag} className="text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{tag}</span>
            ))}
            {task.dueDate && (
              <span className={`text-xs tabular-nums ${task.dueDate <= "2026-02-27" ? "text-red-400" : "text-slate-500"}`}>
                {new Date(task.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {task.assignee && (
              <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300">
                {task.assignee.charAt(0)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCardsTodoist() {
  return (
    <div className="space-y-1">
      {MOCK_TASKS.map((task) => (
        <div key={task.id} className="flex items-start gap-3 px-3 py-3 hover:bg-slate-800/30 rounded-lg transition-colors cursor-pointer group">
          <div className={`w-5 h-5 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            task.status === "done" ? "border-green-400 bg-green-400" : task.priority === "critical" ? "border-red-400" : task.priority === "high" ? "border-amber-400" : "border-slate-600"
          }`}>
            {task.status === "done" && (
              <svg className="w-3 h-3 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span className={`text-sm block ${task.status === "done" ? "text-slate-500 line-through" : "text-slate-100"}`}>
              {task.title}
            </span>
            <div className="flex items-center gap-2 mt-1">
              {task.dueDate && (
                <span className={`text-xs ${task.dueDate <= "2026-02-27" ? "text-red-400" : task.dueDate <= "2026-02-28" ? "text-amber-400" : "text-slate-500"}`}>
                  {task.dueDate === "2026-02-27" ? "Today" : new Date(task.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
              {task.tags.map((tag) => (
                <span key={tag} className="text-xs text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded-full">{tag}</span>
              ))}
              {task.checklist && (
                <span className="text-xs text-slate-500">{task.checklist.done}/{task.checklist.total}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCardsNotion() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_100px_100px_80px_100px] gap-2 px-4 py-2 border-b border-slate-800 text-xs text-slate-500 font-medium uppercase tracking-wider">
        <span>Task</span><span>Status</span><span>Priority</span><span>Due</span><span>Tags</span>
      </div>
      {MOCK_TASKS.map((task) => (
        <div key={task.id} className="grid grid-cols-[1fr_100px_100px_80px_100px] gap-2 px-4 py-2.5 hover:bg-slate-800/40 transition-colors border-b border-slate-800/50 last:border-0 cursor-pointer items-center">
          <div className="flex items-center gap-2 min-w-0">
            <input type="checkbox" checked={task.status === "done"} readOnly className="w-4 h-4 rounded border-slate-600 bg-transparent accent-green-400" />
            <span className={`text-sm truncate ${task.status === "done" ? "text-slate-500 line-through" : "text-slate-100"}`}>{task.title}</span>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full w-fit ${
            task.status === "done" ? "bg-green-500/20 text-green-300" :
            task.status === "in_progress" ? "bg-blue-500/20 text-blue-300" :
            "bg-slate-700 text-slate-300"
          }`}>
            {task.status === "in_progress" ? "In Progress" : task.status === "done" ? "Done" : "To Do"}
          </span>
          <span className={`text-xs px-2 py-1 rounded-full w-fit ${
            task.priority === "critical" ? "bg-red-500/20 text-red-300" :
            task.priority === "high" ? "bg-amber-500/20 text-amber-300" :
            task.priority === "medium" ? "bg-blue-500/20 text-blue-300" :
            "bg-slate-700 text-slate-300"
          }`}>{task.priority}</span>
          <span className={`text-xs tabular-nums ${task.dueDate && task.dueDate <= "2026-02-27" ? "text-red-400" : "text-slate-500"}`}>
            {task.dueDate ? new Date(task.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
          </span>
          <div className="flex gap-1 overflow-hidden">
            {task.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded truncate">{tag}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCardsCompact() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/50">
      {MOCK_TASKS.map((task) => (
        <div key={task.id} className={`flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/40 transition-colors cursor-pointer ${
          task.priority === "critical" ? "border-l-2 border-l-red-500" : task.priority === "high" ? "border-l-2 border-l-amber-500" : "border-l-2 border-l-transparent"
        }`}>
          <span className={`text-xs w-4 text-center ${STATUS_ICONS[task.status]?.color}`}>{STATUS_ICONS[task.status]?.icon}</span>
          <span className={`text-xs flex-1 truncate ${task.status === "done" ? "text-slate-500 line-through" : "text-slate-200"}`}>{task.title}</span>
          {task.checklist && (
            <span className="text-[10px] text-slate-500 tabular-nums">{task.checklist.done}/{task.checklist.total}</span>
          )}
          {task.dueDate && (
            <span className={`text-[10px] tabular-nums ${task.dueDate <= "2026-02-27" ? "text-red-400" : "text-slate-600"}`}>
              {new Date(task.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// 2. HABIT VISUALIZATION VARIANTS
// ============================================================
function HabitHeatmap() {
  const levels = ["bg-slate-800", "bg-green-900/60", "bg-green-600/70", "bg-green-400"];
  const days = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-slate-100">Activity (16 weeks)</h4>
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          <span>Less</span>
          {levels.map((l, i) => <div key={i} className={`w-2.5 h-2.5 rounded-sm ${l}`} />)}
          <span>More</span>
        </div>
      </div>
      <div className="flex gap-1">
        <div className="flex flex-col gap-1 mr-1">
          {days.map((d, i) => (
            <div key={i} className="h-3 text-[9px] text-slate-600 flex items-center">{d}</div>
          ))}
        </div>
        {HEATMAP_DATA.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((level, di) => (
              <div key={di} className={`w-3 h-3 rounded-sm ${levels[level]} transition-colors hover:ring-1 hover:ring-slate-500`} title={`${level} completions`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function HabitRings() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h4 className="text-sm font-semibold text-slate-100 mb-4">Today&apos;s Habits</h4>
      <div className="grid grid-cols-3 gap-4">
        {MOCK_HABITS.map((habit) => {
          const pct = habit.checked ? 100 : 0;
          const circumference = 2 * Math.PI * 20;
          const strokeDashoffset = circumference - (pct / 100) * circumference;
          return (
            <div key={habit.id} className="flex flex-col items-center gap-2">
              <div className="relative w-14 h-14">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-800" />
                  <circle cx="24" cy="24" r="20" fill="none" stroke={habit.color} strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-500" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-lg">
                  {habit.icon}
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-300 truncate max-w-[80px]">{habit.title}</p>
                {habit.streak > 0 && (
                  <p className="text-[10px] text-amber-400 font-medium mt-0.5">🔥 {habit.streak}d</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HabitCalendar() {
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const completedDays = new Set([1, 2, 3, 5, 6, 7, 8, 10, 12, 13, 14, 15, 17, 19, 20, 21, 22, 24, 25, 26, 27]);
  const partialDays = new Set([4, 9, 11, 16, 18, 23]);
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-slate-100">
          {today.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h4>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-400" /> All done</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400/60" /> Partial</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-800" /> Missed</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dayNames.map((d) => (
          <div key={d} className="text-[10px] text-slate-600 text-center pb-1">{d}</div>
        ))}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = day === today.getDate();
          const isComplete = completedDays.has(day);
          const isPartial = partialDays.has(day);
          const isFuture = day > today.getDate();
          return (
            <div
              key={day}
              className={`w-full aspect-square rounded-md flex items-center justify-center text-xs font-medium transition-colors ${
                isFuture ? "text-slate-700" :
                isComplete ? "bg-green-400/20 text-green-300" :
                isPartial ? "bg-amber-400/15 text-amber-300" :
                "bg-slate-800/50 text-slate-600"
              } ${isToday ? "ring-1 ring-green-400" : ""}`}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HabitStreakList() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {MOCK_HABITS.map((habit) => {
        const last7 = [true, true, false, true, true, true, habit.checked];
        return (
          <div key={habit.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
            <button className={`w-6 h-6 rounded-full flex items-center justify-center text-sm flex-shrink-0 transition-all ${
              habit.checked ? "bg-green-400 text-slate-950" : "border-2 border-slate-600 hover:border-green-400"
            }`}>
              {habit.checked && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </button>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-slate-100 block truncate">{habit.title}</span>
            </div>
            <div className="flex items-center gap-1">
              {last7.map((done, i) => (
                <div key={i} className={`w-2 h-2 rounded-full ${done ? "bg-green-400" : "bg-slate-700"}`} />
              ))}
            </div>
            <span className={`text-xs font-bold tabular-nums w-8 text-right ${habit.streak > 0 ? "text-amber-400" : "text-slate-600"}`}>
              {habit.streak > 0 ? `${habit.streak}d` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 3. GOAL PROGRESS VARIANTS
// ============================================================
function GoalsLinearStyle() {
  return (
    <div className="space-y-3">
      {MOCK_GOALS.map((goal) => (
        <div key={goal.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors cursor-pointer">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-100">{goal.title}</h4>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 tabular-nums">{goal.current}</span>
              <span className={`text-xs font-bold tabular-nums ${goal.progress >= 70 ? "text-green-400" : goal.progress >= 40 ? "text-amber-400" : "text-red-400"}`}>
                {goal.progress}%
              </span>
            </div>
          </div>
          <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${goal.progress}%` }} />
            {goal.milestones.map((m, i) => {
              const pos = ((i + 1) / (goal.milestones.length)) * 100;
              return (
                <div key={i} className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 border-slate-900 ${m.done ? "bg-green-400" : "bg-slate-600"}`} style={{ left: `${pos}%` }} />
              );
            })}
          </div>
          {goal.habits.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] text-slate-500">Driven by:</span>
              {goal.habits.map((h) => (
                <span key={h} className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{h}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function GoalsOKRStyle() {
  return (
    <div className="space-y-4">
      {MOCK_GOALS.map((goal) => (
        <div key={goal.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-2.5 h-2.5 rounded-full ${goal.progress >= 70 ? "bg-green-400" : goal.progress >= 40 ? "bg-amber-400" : "bg-red-400"}`} />
            <h4 className="text-sm font-semibold text-slate-100 flex-1">{goal.title}</h4>
            <span className="text-lg font-bold text-slate-100 tabular-nums">{goal.progress}%</span>
          </div>
          {/* Key results */}
          <div className="space-y-3 pl-5 border-l-2 border-slate-800">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Progress</span>
                <span className="text-slate-300 tabular-nums">{goal.current} / {goal.target}</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-green-400/80 rounded-full" style={{ width: `${goal.progress}%` }} />
              </div>
            </div>
            {goal.milestones.length > 0 && (
              <div className="space-y-1.5">
                {goal.milestones.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`text-xs ${m.done ? "text-green-400" : "text-slate-600"}`}>{m.done ? "●" : "○"}</span>
                    <span className={`text-xs ${m.done ? "text-slate-400 line-through" : "text-slate-300"}`}>{m.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function GoalsRadialStyle() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {MOCK_GOALS.map((goal) => {
        const circumference = 2 * Math.PI * 36;
        const offset = circumference - (goal.progress / 100) * circumference;
        const color = goal.progress >= 70 ? "#4ade80" : goal.progress >= 40 ? "#fbbf24" : "#f87171";
        return (
          <div key={goal.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col items-center">
            <div className="relative w-24 h-24 mb-3">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-800" />
                <circle cx="40" cy="40" r="36" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={offset}
                  className="transition-all duration-700" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-slate-100 tabular-nums">{goal.progress}%</span>
              </div>
            </div>
            <h4 className="text-xs font-medium text-slate-100 text-center line-clamp-2">{goal.title}</h4>
            <p className="text-[10px] text-slate-500 mt-1 tabular-nums">{goal.current} / {goal.target}</p>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 4. BUDGET CARD VARIANTS
// ============================================================
function BudgetBarStyle() {
  return (
    <div className="space-y-2">
      {MOCK_BUDGETS.map((b) => {
        const pct = Math.round((b.spent / b.budget) * 100);
        const isOver = pct > 100;
        const isWarning = pct >= 75;
        return (
          <div key={b.category} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{b.icon}</span>
                <span className="text-sm font-medium text-slate-200">{b.category}</span>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold tabular-nums ${isOver ? "text-red-400" : "text-slate-100"}`}>{fmt(b.spent)}</span>
                <span className="text-sm text-slate-500 tabular-nums"> / {fmt(b.budget)}</span>
              </div>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${isOver ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-green-500"}`}
                style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className={`text-[10px] tabular-nums ${isOver ? "text-red-400" : "text-slate-500"}`}>{pct}%</span>
              <span className={`text-[10px] tabular-nums ${b.budget - b.spent < 0 ? "text-red-400" : "text-green-400"}`}>
                {b.budget - b.spent >= 0 ? `${fmt(b.budget - b.spent)} left` : `${fmt(Math.abs(b.budget - b.spent))} over`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BudgetEnvelopeStyle() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {MOCK_BUDGETS.map((b) => {
        const remaining = b.budget - b.spent;
        const isOver = remaining < 0;
        return (
          <div key={b.category} className={`bg-slate-900 border rounded-xl p-4 ${isOver ? "border-red-500/40" : "border-slate-800"}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ backgroundColor: `${b.color}20` }}>
                {b.icon}
              </div>
              <span className="text-sm font-medium text-slate-200">{b.category}</span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${isOver ? "text-red-400" : "text-slate-100"}`}>
              {fmt(Math.abs(remaining))}
            </div>
            <p className={`text-xs mt-0.5 ${isOver ? "text-red-400" : "text-slate-400"}`}>
              {isOver ? "over budget" : "remaining"}
            </p>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-3">
              <div className={`h-full rounded-full ${isOver ? "bg-red-500" : "bg-green-500"}`}
                style={{ width: `${Math.min((b.spent / b.budget) * 100, 100)}%` }} />
            </div>
            <p className="text-[10px] text-slate-600 mt-1 tabular-nums">{fmt(b.spent)} of {fmt(b.budget)}</p>
          </div>
        );
      })}
    </div>
  );
}

function BudgetRingStyle() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="grid grid-cols-5 gap-4">
        {MOCK_BUDGETS.map((b) => {
          const pct = Math.round((b.spent / b.budget) * 100);
          const circumference = 2 * Math.PI * 18;
          const offset = circumference - (Math.min(pct, 100) / 100) * circumference;
          const ringColor = pct > 100 ? "#f87171" : pct >= 75 ? "#fbbf24" : b.color;
          return (
            <div key={b.category} className="flex flex-col items-center gap-2">
              <div className="relative w-12 h-12">
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-800" />
                  <circle cx="22" cy="22" r="18" fill="none" stroke={ringColor} strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={offset} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-base">
                  {b.icon}
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-300 truncate max-w-[60px]">{b.category}</p>
                <p className={`text-[10px] font-bold tabular-nums ${pct > 100 ? "text-red-400" : "text-slate-400"}`}>{pct}%</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-400">Total spent</span>
        <span className="text-sm font-bold text-slate-100 tabular-nums">{fmt(MOCK_BUDGETS.reduce((s, b) => s + b.spent, 0))}</span>
      </div>
    </div>
  );
}

// ============================================================
// 5. NAVIGATION VARIANTS
// ============================================================
const NAV_ITEMS = [
  { label: "Dashboard", icon: "◻", shortcut: "D" },
  { label: "Tasks", icon: "☑", shortcut: "T" },
  { label: "Goals", icon: "◎", shortcut: "G" },
  { label: "Habits", icon: "↻", shortcut: "H" },
  { label: "Budget", icon: "$", shortcut: "B" },
  { label: "Shopping", icon: "▤", shortcut: "S" },
  { label: "Notifications", icon: "◉", shortcut: "N" },
  { label: "Settings", icon: "⚙", shortcut: "," },
];

function NavCurrentStyle() {
  const [active, setActive] = useState(0);
  return (
    <div className="w-56 bg-slate-900 border border-slate-800 rounded-xl py-3">
      <div className="px-4 pb-3 border-b border-slate-800">
        <span className="text-xs font-bold text-green-400 tracking-wider">STARBASE</span>
      </div>
      <div className="pt-2 space-y-0.5 px-2">
        {NAV_ITEMS.map((item, i) => (
          <button key={item.label} onClick={() => setActive(i)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              active === i ? "bg-slate-800 text-green-400 border-l-2 border-green-400 -ml-0.5 pl-[10px]" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
            }`}>
            <span className="w-5 text-center text-xs">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NavLinearStyle() {
  const [active, setActive] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl py-3 transition-all ${collapsed ? "w-14" : "w-56"}`}>
      <div className="px-3 pb-3 border-b border-slate-800 flex items-center justify-between">
        {!collapsed && <span className="text-xs font-bold text-slate-100 tracking-wide">Starbase</span>}
        <button onClick={() => setCollapsed(!collapsed)} className="text-slate-500 hover:text-slate-200 text-xs p-1">
          {collapsed ? "→" : "←"}
        </button>
      </div>
      <div className="pt-2 space-y-px px-2">
        {NAV_ITEMS.map((item, i) => (
          <button key={item.label} onClick={() => setActive(i)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors group ${
              active === i ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}>
            <span className={`w-4 text-center text-xs ${active === i ? "text-green-400" : ""}`}>{item.icon}</span>
            {!collapsed && (
              <>
                <span className="flex-1 text-left">{item.label}</span>
                <kbd className="text-[10px] text-slate-600 group-hover:text-slate-500 font-mono">{item.shortcut}</kbd>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function NavMinimalTopBar() {
  const [active, setActive] = useState(0);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl">
      <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto">
        <span className="text-xs font-bold text-green-400 mr-3">SB</span>
        {NAV_ITEMS.map((item, i) => (
          <button key={item.label} onClick={() => setActive(i)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              active === i ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
            }`}>
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 6. COLOR THEME VARIANTS
// ============================================================
function ThemePreview({ theme }: { theme: typeof ACCENT_THEMES[0] }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.sample }} />
        <span className="text-sm font-semibold text-slate-100">{theme.name}</span>
      </div>
      {/* Sample button */}
      <button className="w-full py-2 rounded-lg text-sm font-semibold text-slate-950 transition-colors" style={{ backgroundColor: theme.sample }}>
        Primary Action
      </button>
      {/* Sample card */}
      <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: `${theme.sample}10`, borderColor: `${theme.sample}30`, borderWidth: "1px" }}>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.sample }} />
          <span className="text-sm text-slate-100">Active Goal</span>
          <span className="ml-auto text-xs font-bold" style={{ color: theme.sample }}>67%</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ backgroundColor: theme.sample, width: "67%" }} />
        </div>
      </div>
      {/* Sample nav item */}
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800" style={{ borderLeftWidth: "2px", borderLeftColor: theme.sample }}>
        <span className="text-sm" style={{ color: theme.sample }}>◎</span>
        <span className="text-sm text-slate-100">Selected Item</span>
      </div>
      {/* Sample badge */}
      <div className="flex gap-2">
        <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${theme.sample}20`, color: theme.sample }}>Active</span>
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-300">Paused</span>
      </div>
    </div>
  );
}

// ============================================================
// 7. DASHBOARD LAYOUT VARIANTS
// ============================================================
function DashboardBento() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Large: Today's habits */}
      <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Today&apos;s Habits</h4>
        <div className="flex items-center gap-4 mb-3">
          <span className="text-3xl font-bold text-green-400">3<span className="text-slate-500 text-lg">/6</span></span>
          <div className="flex-1 h-2 bg-slate-800 rounded-full"><div className="h-2 bg-green-400 rounded-full" style={{ width: "50%" }} /></div>
        </div>
        <div className="flex items-center gap-2">
          {MOCK_HABITS.map((h) => (
            <div key={h.id} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${h.checked ? "bg-green-400/20 ring-2 ring-green-400" : "bg-slate-800"}`}>
              {h.icon}
            </div>
          ))}
        </div>
      </div>
      {/* Small: Streak hero */}
      <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-4 flex flex-col items-center justify-center">
        <span className="text-4xl mb-1">🔥</span>
        <span className="text-3xl font-bold text-amber-400">21</span>
        <span className="text-xs text-amber-400/70">day streak</span>
      </div>
      {/* Medium: Goals */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Goals</h4>
        <div className="space-y-3">
          {MOCK_GOALS.slice(0, 2).map((g) => (
            <div key={g.id}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 truncate">{g.title}</span>
                <span className="text-green-400 font-bold tabular-nums">{g.progress}%</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full"><div className="h-1 bg-green-400 rounded-full" style={{ width: `${g.progress}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      {/* Medium: Tasks due */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Due Soon</h4>
        <div className="space-y-2">
          {MOCK_TASKS.filter((t) => t.dueDate && t.status !== "done").slice(0, 3).map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <span className={`text-xs ${STATUS_ICONS[t.status]?.color}`}>{STATUS_ICONS[t.status]?.icon}</span>
              <span className="text-xs text-slate-300 flex-1 truncate">{t.title}</span>
              <span className={`text-[10px] tabular-nums ${t.dueDate! <= "2026-02-27" ? "text-red-400" : "text-slate-500"}`}>
                {t.dueDate === "2026-02-27" ? "Today" : new Date(t.dueDate! + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      </div>
      {/* Medium: Budget */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Budget</h4>
        <div className="text-center">
          <span className="text-2xl font-bold text-slate-100 tabular-nums">{fmt(MOCK_BUDGETS.reduce((s, b) => s + (b.budget - b.spent), 0))}</span>
          <p className="text-xs text-slate-400">remaining this month</p>
        </div>
        <div className="mt-3 flex justify-center gap-1">
          {MOCK_BUDGETS.map((b) => {
            const pct = (b.spent / b.budget) * 100;
            return <div key={b.category} className={`w-4 h-4 rounded-full ${pct > 100 ? "bg-red-400" : pct > 75 ? "bg-amber-400" : "bg-green-400"}`} title={b.category} />;
          })}
        </div>
      </div>
    </div>
  );
}

function DashboardFeedStyle() {
  return (
    <div className="max-w-xl space-y-3">
      {/* Time header */}
      <div className="flex items-center gap-3">
        <h4 className="text-lg font-light text-slate-400">Thursday, Feb 27</h4>
        <span className="text-xs bg-green-400/10 text-green-400 px-2 py-0.5 rounded-full">3/6 habits done</span>
      </div>
      {/* Focus section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Focus</span>
        <p className="text-sm text-slate-100 mt-1 font-medium">Fix auth token refresh on mobile</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">Critical</span>
          <span className="text-xs text-red-400">Due today</span>
        </div>
      </div>
      {/* Timeline feed */}
      {[
        { time: "9:00", label: "Habit check-ins", type: "habit", items: MOCK_HABITS.slice(0, 3) },
        { time: "10:00", label: "Active tasks", type: "tasks" },
        { time: "12:00", label: "Goal progress", type: "goals" },
      ].map((block) => (
        <div key={block.time} className="flex gap-3">
          <div className="w-12 text-right">
            <span className="text-xs text-slate-600 tabular-nums">{block.time}</span>
          </div>
          <div className="w-px bg-slate-800 flex-shrink-0" />
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-3">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{block.label}</span>
            {block.type === "habit" && (
              <div className="flex gap-2 mt-2">
                {(block.items as typeof MOCK_HABITS).map((h) => (
                  <span key={h.id} className={`text-lg ${h.checked ? "" : "opacity-30"}`}>{h.icon}</span>
                ))}
              </div>
            )}
            {block.type === "tasks" && (
              <div className="mt-2 space-y-1">
                {MOCK_TASKS.filter((t) => t.status !== "done").slice(0, 2).map((t) => (
                  <div key={t.id} className="text-xs text-slate-300">{STATUS_ICONS[t.status]?.icon} {t.title}</div>
                ))}
              </div>
            )}
            {block.type === "goals" && (
              <div className="mt-2 space-y-1.5">
                {MOCK_GOALS.slice(0, 2).map((g) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-slate-800 rounded-full"><div className="h-1 bg-green-400 rounded-full" style={{ width: `${g.progress}%` }} /></div>
                    <span className="text-[10px] text-slate-400 tabular-nums">{g.progress}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardMetricsFirst() {
  const totalBudget = MOCK_BUDGETS.reduce((s, b) => s + b.budget, 0);
  const totalSpent = MOCK_BUDGETS.reduce((s, b) => s + b.spent, 0);
  return (
    <div className="space-y-4">
      {/* Big metrics strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Habits Today", value: "3/6", sub: "50%", color: "text-green-400" },
          { label: "Best Streak", value: "21d", sub: "Journal", color: "text-amber-400" },
          { label: "Goal Progress", value: "62%", sub: "avg across 3", color: "text-blue-400" },
          { label: "Budget Left", value: fmt(totalBudget - totalSpent), sub: `of ${fmt(totalBudget)}`, color: "text-slate-100" },
        ].map((m) => (
          <div key={m.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <span className={`text-2xl font-bold tabular-nums ${m.color}`}>{m.value}</span>
            <p className="text-[10px] text-slate-500 mt-1">{m.label}</p>
            <p className="text-[10px] text-slate-600">{m.sub}</p>
          </div>
        ))}
      </div>
      {/* Two-column detail */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Overdue & Due Today</h4>
          {MOCK_TASKS.filter((t) => t.dueDate && t.dueDate <= "2026-02-28" && t.status !== "done").map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${t.priority === "critical" ? "bg-red-400" : "bg-amber-400"}`} />
              <span className="text-xs text-slate-300 flex-1 truncate">{t.title}</span>
            </div>
          ))}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Budget Status</h4>
          {MOCK_BUDGETS.map((b) => (
            <div key={b.category} className="flex items-center gap-2 py-1">
              <span className="text-xs">{b.icon}</span>
              <span className="text-xs text-slate-400 flex-1">{b.category}</span>
              <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${(b.spent / b.budget) > 1 ? "bg-red-400" : "bg-green-400"}`} style={{ width: `${Math.min((b.spent / b.budget) * 100, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function DesignReviewPage() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const sections = [
    { id: "tasks", label: "Task Cards" },
    { id: "habits", label: "Habit Viz" },
    { id: "goals", label: "Goal Progress" },
    { id: "budgets", label: "Budget Cards" },
    { id: "nav", label: "Navigation" },
    { id: "themes", label: "Color Themes" },
    { id: "dashboard", label: "Dashboard" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Sticky header */}
      <div className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold">Design Review</h1>
              <p className="text-sm text-slate-400">Compare UI variants side by side. Click a section to jump.</p>
            </div>
            <a href="/dashboard" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Back to app</a>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`}
                onClick={() => setActiveSection(s.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  activeSection === s.id ? "bg-green-400 text-slate-950" : "bg-slate-800 text-slate-400 hover:text-slate-100"
                }`}>
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-16">

        {/* 1. TASK CARDS */}
        <div id="tasks">
          <Section title="Task Cards" description="How individual tasks appear in list views. Affects scannability, information density, and interaction.">
            <div className="grid grid-cols-2 gap-6">
              <VariantLabel name="A. Linear-style" inspiration="Inspired by Linear">
                <TaskCardsLinear />
              </VariantLabel>
              <VariantLabel name="B. Todoist-style" inspiration="Inspired by Todoist/Things 3">
                <TaskCardsTodoist />
              </VariantLabel>
              <VariantLabel name="C. Notion-style Table" inspiration="Inspired by Notion databases">
                <TaskCardsNotion />
              </VariantLabel>
              <VariantLabel name="D. Ultra-Compact" inspiration="Inspired by terminal/spreadsheet UIs">
                <TaskCardsCompact />
              </VariantLabel>
            </div>
          </Section>
        </div>

        {/* 2. HABIT VISUALIZATIONS */}
        <div id="habits">
          <Section title="Habit Visualizations" description="How habit tracking data is displayed. Affects motivation, at-a-glance understanding, and engagement.">
            <div className="grid grid-cols-2 gap-6">
              <VariantLabel name="A. GitHub Contribution Graph" inspiration="Inspired by GitHub">
                <HabitHeatmap />
              </VariantLabel>
              <VariantLabel name="B. Completion Rings" inspiration="Inspired by Apple Watch / Streaks app">
                <HabitRings />
              </VariantLabel>
              <VariantLabel name="C. Calendar Grid" inspiration="Inspired by habit calendar apps">
                <HabitCalendar />
              </VariantLabel>
              <VariantLabel name="D. Streak List" inspiration="Inspired by Duolingo / TickTick">
                <HabitStreakList />
              </VariantLabel>
            </div>
          </Section>
        </div>

        {/* 3. GOAL PROGRESS */}
        <div id="goals">
          <Section title="Goal Progress" description="How goals and their progress are visualized. Affects goal clarity and motivation.">
            <div className="grid grid-cols-1 gap-6">
              <VariantLabel name="A. Linear Project Style" inspiration="Inspired by Linear projects">
                <GoalsLinearStyle />
              </VariantLabel>
              <div className="grid grid-cols-2 gap-6">
                <VariantLabel name="B. OKR Cascade" inspiration="Inspired by Lattice / 15Five">
                  <GoalsOKRStyle />
                </VariantLabel>
                <VariantLabel name="C. Radial Gauges" inspiration="Inspired by fitness/dashboard apps">
                  <GoalsRadialStyle />
                </VariantLabel>
              </div>
            </div>
          </Section>
        </div>

        {/* 4. BUDGET CARDS */}
        <div id="budgets">
          <Section title="Budget Cards" description="How budget categories and spending are displayed. Affects financial awareness and decision-making.">
            <div className="grid grid-cols-1 gap-6">
              <VariantLabel name="A. Copilot-style Progress Bars" inspiration="Inspired by Copilot Money">
                <BudgetBarStyle />
              </VariantLabel>
              <div className="grid grid-cols-2 gap-6">
                <VariantLabel name="B. YNAB Envelope Style" inspiration="Inspired by YNAB">
                  <BudgetEnvelopeStyle />
                </VariantLabel>
                <VariantLabel name="C. Compact Ring Grid" inspiration="Inspired by Apple Watch rings">
                  <BudgetRingStyle />
                </VariantLabel>
              </div>
            </div>
          </Section>
        </div>

        {/* 5. NAVIGATION */}
        <div id="nav">
          <Section title="Navigation" description="How you move between sections of the app. Affects speed, discoverability, and focus.">
            <div className="grid grid-cols-3 gap-6 items-start">
              <VariantLabel name="A. Current Sidebar" inspiration="Current Starbase design">
                <NavCurrentStyle />
              </VariantLabel>
              <VariantLabel name="B. Collapsible + Shortcuts" inspiration="Inspired by Linear">
                <NavLinearStyle />
              </VariantLabel>
              <VariantLabel name="C. Top Bar Pills" inspiration="Inspired by Arc/Raycast">
                <NavMinimalTopBar />
              </VariantLabel>
            </div>
          </Section>
        </div>

        {/* 6. COLOR THEMES */}
        <div id="themes">
          <Section title="Color Themes" description="Accent color that defines the app's personality. Affects mood, brand feel, and visual hierarchy.">
            <div className="grid grid-cols-3 gap-4">
              {ACCENT_THEMES.map((theme) => (
                <ThemePreview key={theme.name} theme={theme} />
              ))}
            </div>
          </Section>
        </div>

        {/* 7. DASHBOARD LAYOUTS */}
        <div id="dashboard">
          <Section title="Dashboard Layouts" description="How the home screen organizes all your data. Affects daily workflow and information hierarchy.">
            <div className="space-y-8">
              <VariantLabel name="A. Bento Grid" inspiration="Inspired by Arc/Linear — visual hierarchy through card sizing">
                <DashboardBento />
              </VariantLabel>
              <VariantLabel name="B. Timeline Feed" inspiration="Inspired by Sunsama — time-based, single-column, intentional planning">
                <DashboardFeedStyle />
              </VariantLabel>
              <VariantLabel name="C. Metrics-First" inspiration="Inspired by Copilot Money — big numbers, then details">
                <DashboardMetricsFirst />
              </VariantLabel>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 pt-8 text-center">
          <p className="text-sm text-slate-400">Review each section and tell me which variants you prefer.</p>
          <p className="text-xs text-slate-600 mt-1">Mix and match — you can pick different styles for different areas.</p>
        </div>
      </div>
    </div>
  );
}
