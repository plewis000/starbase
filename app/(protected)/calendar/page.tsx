"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import CalendarView, { type CalendarItem } from "@/components/ui/CalendarView";
import { useHouseholdTimezone } from "@/hooks/useHouseholdTimezone";
import { todayInTimezone } from "@/lib/dateUtils";

const TYPE_FILTERS = [
  { key: "task", label: "Tasks", color: "#ef4444" },
  { key: "goal", label: "Goals", color: "#f59e0b" },
  { key: "goal_milestone", label: "Milestones", color: "#f59e0b" },
  { key: "habit", label: "Habits", color: "#8b5cf6" },
  { key: "birthday", label: "Birthdays", color: "#ec4899" },
  { key: "anniversary", label: "Anniversaries", color: "#f472b6" },
  { key: "life_event", label: "Events", color: "#06b6d4" },
];

export default function CalendarPage() {
  const { timezone } = useHouseholdTimezone();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(TYPE_FILTERS.map((t) => t.key)));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Calculate date range for current month view (with padding)
  const { start, end } = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    // Pad to include prev/next month days shown in grid
    first.setDate(first.getDate() - first.getDay());
    last.setDate(last.getDate() + (6 - last.getDay()));
    return {
      start: first.toISOString().split("T")[0],
      end: last.toISOString().split("T")[0],
    };
  }, [year, month]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?start=${start}&end=${end}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [start, end]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filteredItems = useMemo(
    () => items.filter((i) => activeTypes.has(i.type)),
    [items, activeTypes]
  );

  const toggleType = (key: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100 dcc-heading tracking-wide">Calendar</h1>
      </div>

      {/* Type filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {TYPE_FILTERS.map((tf) => (
          <button
            key={tf.key}
            onClick={() => toggleType(tf.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              activeTypes.has(tf.key)
                ? "border-dungeon-600 bg-dungeon-800 text-slate-200"
                : "border-dungeon-800 bg-dungeon-950 text-dungeon-500"
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tf.color }} />
            {tf.label}
          </button>
        ))}
      </div>

      {/* Calendar */}
      <div className="min-h-[500px]">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-2 border-dungeon-700 border-t-crimson-500 rounded-full" />
          </div>
        ) : (
          <CalendarView
            items={filteredItems}
            timezone={timezone}
            initialDate={viewDate}
          />
        )}
      </div>
    </div>
  );
}
