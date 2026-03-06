"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";

// ─── Helpers ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// ─── Relative label ──────────────────────────────────────────────────────

function relativeLabel(dateStr: string): { text: string; color: string } {
  if (!dateStr) return { text: "No date", color: "text-slate-500" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseDate(dateStr);
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays < 0) return { text: `Overdue (${Math.abs(diffDays)}d ago)`, color: "text-red-400" };
  if (diffDays === 0) return { text: "Today", color: "text-amber-400" };
  if (diffDays === 1) return { text: "Tomorrow", color: "text-amber-300" };
  if (diffDays <= 7) return { text: `In ${diffDays}d`, color: "text-slate-300" };
  if (diffDays <= 30) return { text: `In ${Math.floor(diffDays / 7)}w`, color: "text-slate-400" };
  return { text: `In ${Math.floor(diffDays / 30)}mo`, color: "text-slate-500" };
}

// ─── Presets ─────────────────────────────────────────────────────────────

function getPresets(): { label: string; value: string }[] {
  const today = new Date();
  return [
    { label: "Today", value: toDateStr(today) },
    { label: "Tomorrow", value: toDateStr(addDays(today, 1)) },
    { label: "Next Week", value: toDateStr(addDays(today, 7 - today.getDay() || 7)) },
    { label: "Next Month", value: toDateStr(new Date(today.getFullYear(), today.getMonth() + 1, 1)) },
    { label: "None", value: "" },
  ];
}

// ─── Calendar Grid ───────────────────────────────────────────────────────

function CalendarGrid({
  value,
  onChange,
  viewDate,
  onViewDateChange,
}: {
  value: string;
  onChange: (d: string) => void;
  viewDate: Date;
  onViewDateChange: (d: Date) => void;
}) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const totalDays = daysInMonth(year, month);
  const firstDow = startOfMonth(viewDate).getDay(); // 0=Sun
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = value ? parseDate(value) : null;

  const prevMonth = () => onViewDateChange(new Date(year, month - 1, 1));
  const nextMonth = () => onViewDateChange(new Date(year, month + 1, 1));

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  return (
    <div className="mt-2 p-2 bg-slate-800/80 border border-slate-700 rounded-lg w-[260px]">
      {/* Month/Year nav */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button type="button" onClick={prevMonth} className="p-1 text-slate-400 hover:text-slate-100 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span className="text-xs font-semibold text-slate-200">{MONTHS[month]} {year}</span>
        <button type="button" onClick={nextMonth} className="p-1 text-slate-400 hover:text-slate-100 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-slate-500 py-0.5">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const cellDate = new Date(year, month, day);
          const isToday = isSameDay(cellDate, today);
          const isSelected = selected && isSameDay(cellDate, selected);

          return (
            <button
              key={day}
              type="button"
              onClick={() => onChange(toDateStr(cellDate))}
              className={`w-8 h-8 rounded text-xs font-medium transition-all ${
                isSelected
                  ? "bg-red-500/30 text-red-300 ring-1 ring-red-400/60"
                  : isToday
                  ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                  : "text-slate-300 hover:bg-slate-700"
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

// ─── DatePicker Component ────────────────────────────────────────────────

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  showRelative?: boolean;
}

export default function DatePicker({ value, onChange, showRelative = true }: DatePickerProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() =>
    value ? parseDate(value) : new Date()
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const presets = useMemo(() => getPresets(), []);
  const rel = useMemo(() => (showRelative && value ? relativeLabel(value) : null), [value, showRelative]);

  // Close calendar on outside click
  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalendar]);

  // Sync viewDate when value changes externally
  useEffect(() => {
    if (value) setViewDate(parseDate(value));
  }, [value]);

  const handlePreset = (v: string) => {
    onChange(v);
    if (v) setViewDate(parseDate(v));
    setShowCalendar(false);
  };

  const handleCalendarSelect = (v: string) => {
    onChange(v);
    setShowCalendar(false);
  };

  return (
    <div ref={containerRef} className="space-y-1.5">
      {/* Preset pills + calendar toggle */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handlePreset(p.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              value === p.value
                ? "bg-red-500/20 text-red-300 ring-2 ring-red-400/60 border-transparent"
                : "bg-slate-700 text-slate-300 border-slate-600 hover:ring-1 hover:ring-slate-500"
            }`}
          >
            {p.label}
          </button>
        ))}
        {/* Calendar icon toggle */}
        <button
          type="button"
          onClick={() => setShowCalendar((v) => !v)}
          className={`p-1.5 rounded-full border transition-all ${
            showCalendar
              ? "bg-red-500/20 text-red-300 ring-2 ring-red-400/60 border-transparent"
              : "bg-slate-700 text-slate-400 border-slate-600 hover:text-slate-200 hover:ring-1 hover:ring-slate-500"
          }`}
          aria-label="Toggle calendar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
      </div>

      {/* Relative label */}
      {rel && (
        <span className={`text-xs font-medium ${rel.color}`}>{rel.text}</span>
      )}

      {/* Calendar dropdown */}
      {showCalendar && (
        <CalendarGrid
          value={value}
          onChange={handleCalendarSelect}
          viewDate={viewDate}
          onViewDateChange={setViewDate}
        />
      )}
    </div>
  );
}
