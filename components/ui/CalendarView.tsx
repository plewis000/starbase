"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { todayInTimezone } from "@/lib/dateUtils";

export interface CalendarItem {
  type: string;
  id: string;
  title: string;
  date: string;
  endDate?: string;
  color?: string;
  meta?: Record<string, unknown>;
}

interface Props {
  items: CalendarItem[];
  timezone: string;
  onItemClick?: (item: CalendarItem) => void;
  initialDate?: Date;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthDays(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: { date: Date; inMonth: boolean }[] = [];

  // Pad start to Sunday
  for (let i = firstDay.getDay() - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, inMonth: false });
  }

  // Month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), inMonth: true });
  }

  // Pad end to fill last week
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), inMonth: false });
    }
  }

  return days;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TYPE_LABELS: Record<string, string> = {
  task: "Task",
  goal: "Goal",
  goal_milestone: "Milestone",
  habit: "Habit",
  birthday: "Birthday",
  anniversary: "Anniversary",
  life_event: "Event",
};

export default function CalendarView({ items, timezone, onItemClick, initialDate }: Props) {
  const today = useMemo(() => todayInTimezone(timezone), [timezone]);
  const todayKey = dateKey(today);

  const [viewDate, setViewDate] = useState(() => initialDate || today);
  const [popoverDay, setPopoverDay] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthDays = useMemo(() => getMonthDays(year, month), [year, month]);

  // Group items by date
  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = item.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);

      // For multi-day events, add to each day
      if (item.endDate && item.endDate !== item.date) {
        const start = new Date(item.date);
        const end = new Date(item.endDate);
        const cur = new Date(start);
        cur.setDate(cur.getDate() + 1);
        while (cur <= end) {
          const k = dateKey(cur);
          if (!map.has(k)) map.set(k, []);
          map.get(k)!.push(item);
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
    return map;
  }, [items]);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => setViewDate(today);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverDay) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverDay(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverDay]);

  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col h-full">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="px-2 py-1 rounded text-sm text-slate-400 hover:text-slate-100 hover:bg-dungeon-800 transition-colors">
            &lt;
          </button>
          <h2 className="text-lg font-bold text-slate-100 min-w-[180px] text-center">{monthLabel}</h2>
          <button onClick={nextMonth} className="px-2 py-1 rounded text-sm text-slate-400 hover:text-slate-100 hover:bg-dungeon-800 transition-colors">
            &gt;
          </button>
        </div>
        <button onClick={goToday} className="px-3 py-1 text-xs font-medium text-slate-400 border border-dungeon-700 rounded-lg hover:bg-dungeon-800 transition-colors">
          Today
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-slate-500 uppercase py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px flex-1 bg-dungeon-800/30 rounded-lg overflow-hidden">
        {monthDays.map(({ date, inMonth }, idx) => {
          const key = dateKey(date);
          const isToday = key === todayKey;
          const dayItems = itemsByDate.get(key) || [];
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;

          return (
            <div
              key={idx}
              onClick={() => dayItems.length > 0 && setPopoverDay(popoverDay === key ? null : key)}
              className={`relative min-h-[72px] p-1 transition-colors cursor-pointer ${
                inMonth ? "bg-dungeon-950" : "bg-dungeon-950/50"
              } ${isWeekend ? "bg-dungeon-900/30" : ""} ${
                dayItems.length > 0 ? "hover:bg-dungeon-800/50" : ""
              }`}
            >
              <span className={`text-[11px] font-mono block text-right ${
                isToday
                  ? "text-red-400 font-bold"
                  : inMonth
                    ? "text-slate-400"
                    : "text-slate-600"
              }`}>
                {date.getDate()}
              </span>

              {/* Item dots/chips */}
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {dayItems.slice(0, 3).map((item, i) => (
                  <div
                    key={`${item.id}-${i}`}
                    className="w-full truncate text-[9px] leading-tight px-1 py-0.5 rounded"
                    style={{ backgroundColor: (item.color || "#64748b") + "20", color: item.color || "#94a3b8" }}
                    title={item.title}
                  >
                    {item.title}
                  </div>
                ))}
                {dayItems.length > 3 && (
                  <span className="text-[9px] text-slate-500">+{dayItems.length - 3}</span>
                )}
              </div>

              {/* Popover */}
              {popoverDay === key && dayItems.length > 0 && (
                <div
                  ref={popoverRef}
                  className="absolute z-40 top-full left-0 mt-1 bg-dungeon-800 border border-dungeon-700 rounded-lg shadow-xl p-2 min-w-[180px] max-w-[240px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-[10px] text-slate-500 font-semibold mb-1">
                    {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                  <div className="space-y-1 max-h-[200px] overflow-auto">
                    {dayItems.map((item, i) => (
                      <button
                        key={`${item.id}-${i}`}
                        onClick={() => onItemClick?.(item)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-dungeon-700 transition-colors flex items-center gap-2"
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color || "#64748b" }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-slate-200 truncate">{item.title}</div>
                          <div className="text-[9px] text-slate-500">{TYPE_LABELS[item.type] || item.type}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
