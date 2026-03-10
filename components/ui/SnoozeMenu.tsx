"use client";

import React, { useState, useRef, useEffect } from "react";

export const SNOOZE_OPTIONS = [
  { label: "Tomorrow", value: "tomorrow" },
  { label: "This Weekend", value: "weekend" },
  { label: "Next Week", value: "next_week" },
];

function snoozeDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function snoozeFormatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SnoozeCalendar({ onSelect }: { onSelect: (date: string) => void }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const totalDays = snoozeDaysInMonth(year, month);
  const firstDow = new Date(year, month, 1).getDay();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  return (
    <div className="p-2 w-[240px]">
      <div className="flex items-center justify-between mb-2 px-1">
        <button onClick={prevMonth} className="p-1 text-dungeon-400 hover:text-slate-100 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span className="text-[11px] font-semibold text-slate-200">{MONTHS[month]} {year}</span>
        <button onClick={nextMonth} className="p-1 text-dungeon-400 hover:text-slate-100 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-[9px] font-medium text-dungeon-500 py-0.5">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const cellDate = new Date(year, month, day);
          const isToday = cellDate.getTime() === today.getTime();
          const isPast = cellDate <= today;

          return (
            <button
              key={day}
              disabled={isPast}
              onClick={() => onSelect(snoozeFormatDate(cellDate))}
              className={`w-7 h-7 rounded text-[11px] font-medium transition-all ${
                isPast
                  ? "text-dungeon-700 cursor-not-allowed"
                  : isToday
                  ? "text-amber-400 bg-amber-500/10"
                  : "text-slate-300 hover:bg-amber-500/20 hover:text-amber-300"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SnoozeMenu({ taskId, onSnooze }: { taskId: string; onSnooze: (taskId: string, until: string) => void }) {
  const [open, setOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="px-2 py-1 rounded-md text-xs font-medium text-amber-500/70 hover:text-amber-400 hover:bg-amber-400/10 border border-transparent hover:border-amber-400/20 transition-all"
        title="Snooze"
      >
        💤
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-dungeon-800 border border-dungeon-700 rounded-lg shadow-xl py-1 min-w-[160px]">
          {SNOOZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={(e) => {
                e.stopPropagation();
                onSnooze(taskId, opt.value);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-dungeon-700 hover:text-slate-100 transition-colors"
            >
              {opt.label}
            </button>
          ))}
          <div className="border-t border-dungeon-700 mt-1 pt-1">
            {!showDatePicker ? (
              <button
                onClick={(e) => { e.stopPropagation(); setShowDatePicker(true); }}
                className="w-full text-left px-3 py-2 text-xs text-dungeon-400 hover:bg-dungeon-700 hover:text-slate-100 transition-colors"
              >
                Pick a date...
              </button>
            ) : (
              <div onClick={(e) => e.stopPropagation()}>
                <SnoozeCalendar
                  onSelect={(date) => {
                    onSnooze(taskId, date);
                    setOpen(false);
                    setShowDatePicker(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
