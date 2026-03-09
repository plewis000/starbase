"use client";

import React, { useState, useEffect, useMemo } from "react";

interface CompletionEvent {
  routine_id: string;
  routine_title: string;
  frequency: string;
  frequency_name: string;
  date: string;
}

interface Routine {
  id: string;
  title: string;
  frequency: string;
  frequency_name: string;
  completions: Record<string, boolean>;
}

interface Props {
  onSelectRoutine?: (id: string) => void;
  refreshTrigger?: number;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const FREQ_COLORS: Record<string, string> = {
  daily: "bg-blue-400",
  weekly: "bg-purple-400",
  biweekly: "bg-violet-400",
  monthly: "bg-amber-400",
  quarterly: "bg-orange-400",
  biannual: "bg-rose-400",
  yearly: "bg-emerald-400",
};

const FREQ_TEXT_COLORS: Record<string, string> = {
  daily: "text-blue-400",
  weekly: "text-purple-400",
  biweekly: "text-violet-400",
  monthly: "text-amber-400",
  quarterly: "text-orange-400",
  biannual: "text-rose-400",
  yearly: "text-emerald-400",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getRelativeDay(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return "Today";
  const d = new Date(dateStr + "T12:00:00");
  const t = new Date(todayStr + "T12:00:00");
  const diff = Math.round((t.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 1) return "Yesterday";
  if (diff <= 7) return `${diff} days ago`;
  return "";
}

export default function RoutineTimeline({ onSelectRoutine, refreshTrigger }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFreq, setFilterFreq] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayStr = toDateStr(today);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch 5 weeks to cover ~35 days of completions
        const promises = [];
        for (let weekOffset = -4; weekOffset <= 0; weekOffset++) {
          const d = new Date(today);
          d.setDate(d.getDate() + weekOffset * 7);
          promises.push(
            fetch(`/api/routines/week?date=${toDateStr(d)}`).then((r) => r.json())
          );
        }
        const results = await Promise.all(promises);

        const routineMap = new Map<string, Routine>();
        for (const result of results) {
          for (const r of result.routines || []) {
            if (!routineMap.has(r.id)) {
              routineMap.set(r.id, { ...r, completions: {} });
            }
            Object.assign(routineMap.get(r.id)!.completions, r.completions);
          }
        }

        setRoutines(Array.from(routineMap.values()));
      } catch (err) {
        console.error("Failed to fetch:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [today, refreshTrigger]);

  // Build flat completion event list, sorted newest first
  const events = useMemo(() => {
    const list: CompletionEvent[] = [];
    for (const r of routines) {
      if (filterFreq && r.frequency !== filterFreq) continue;
      for (const [date, done] of Object.entries(r.completions)) {
        if (done) {
          list.push({
            routine_id: r.id,
            routine_title: r.title,
            frequency: r.frequency,
            frequency_name: r.frequency_name,
            date,
          });
        }
      }
    }
    list.sort((a, b) => b.date.localeCompare(a.date));
    return list;
  }, [routines, filterFreq]);

  // Group events by date
  const groupedByDate = useMemo(() => {
    const groups: { date: string; events: CompletionEvent[] }[] = [];
    let currentDate = "";
    for (const ev of events) {
      if (ev.date !== currentDate) {
        currentDate = ev.date;
        groups.push({ date: ev.date, events: [] });
      }
      groups[groups.length - 1].events.push(ev);
    }
    return groups;
  }, [events]);

  // Get unique frequencies for filter
  const frequencies = useMemo(() => {
    const set = new Set<string>();
    for (const r of routines) set.add(r.frequency);
    return Array.from(set).sort();
  }, [routines]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin w-8 h-8 border-2 border-dungeon-700 border-t-red-500 rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header with filters */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-100">Completion History</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterFreq(null)}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              filterFreq === null
                ? "bg-dungeon-700 text-slate-200"
                : "text-dungeon-500 hover:text-slate-300"
            }`}
          >
            All
          </button>
          {frequencies.map((freq) => (
            <button
              key={freq}
              onClick={() => setFilterFreq(filterFreq === freq ? null : freq)}
              className={`px-2 py-1 rounded text-[10px] font-medium capitalize transition-colors ${
                filterFreq === freq
                  ? "bg-dungeon-700 text-slate-200"
                  : "text-dungeon-500 hover:text-slate-300"
              }`}
            >
              {freq}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {groupedByDate.length > 0 ? (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-dungeon-800" />

          <div className="space-y-6">
            {groupedByDate.map((group) => {
              const relative = getRelativeDay(group.date, todayStr);
              return (
                <div key={group.date}>
                  {/* Date header */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-[15px] h-[15px] rounded-full bg-dungeon-800 border-2 border-dungeon-700 flex-shrink-0 z-10" />
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-slate-300">
                        {formatDate(group.date)}
                      </span>
                      {relative && (
                        <span className="text-[10px] text-dungeon-500">{relative}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-dungeon-600 font-mono">
                      {group.events.length} completed
                    </span>
                  </div>

                  {/* Events for this date */}
                  <div className="ml-[30px] space-y-1">
                    {group.events.map((ev) => (
                      <button
                        key={`${ev.routine_id}-${ev.date}`}
                        onClick={() => onSelectRoutine?.(ev.routine_id)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-dungeon-900 border border-dungeon-800 hover:border-dungeon-700 transition-colors text-left group"
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${FREQ_COLORS[ev.frequency] || "bg-dungeon-500"}`} />
                        <span className="text-sm text-slate-200 truncate flex-1 group-hover:text-slate-100">
                          {ev.routine_title}
                        </span>
                        <span className={`text-[10px] font-medium flex-shrink-0 ${FREQ_TEXT_COLORS[ev.frequency] || "text-dungeon-400"}`}>
                          {ev.frequency_name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-dungeon-500 text-sm">
            {filterFreq ? `No ${filterFreq} completions found` : "No completions recorded yet"}
          </p>
        </div>
      )}
    </div>
  );
}
