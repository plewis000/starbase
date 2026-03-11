"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";

// ─── Helpers ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

// ─── Date display ───────────────────────────────────────────────────────

function formatDateDisplay(dateStr: string): { relative: string; absolute: string; color: string } {
  if (!dateStr) return { relative: "No date", absolute: "", color: "text-dungeon-500" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseDate(dateStr);
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  const absolute = target.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  if (diffDays < -1) return { relative: `${Math.abs(diffDays)}d overdue`, absolute, color: "text-red-400" };
  if (diffDays === -1) return { relative: "Yesterday", absolute, color: "text-red-400" };
  if (diffDays === 0) return { relative: "Today", absolute, color: "text-amber-400" };
  if (diffDays === 1) return { relative: "Tomorrow", absolute, color: "text-emerald-400" };
  if (diffDays <= 7) return { relative: `In ${diffDays} days`, absolute, color: "text-slate-300" };
  if (diffDays <= 30) return { relative: `In ${Math.floor(diffDays / 7)}w`, absolute, color: "text-dungeon-400" };
  return { relative: `In ${Math.floor(diffDays / 30)}mo`, absolute, color: "text-dungeon-500" };
}

// ─── Presets ─────────────────────────────────────────────────────────────

function getPresets(): { label: string; value: string; sublabel?: string }[] {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const nextMon = addDays(today, (8 - today.getDay()) % 7 || 7);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  return [
    { label: "Today", value: toDateStr(today), sublabel: today.toLocaleDateString("en-US", { weekday: "short" }) },
    { label: "Tomorrow", value: toDateStr(tomorrow), sublabel: tomorrow.toLocaleDateString("en-US", { weekday: "short" }) },
    { label: "Next Monday", value: toDateStr(nextMon), sublabel: nextMon.toLocaleDateString("en-US", { month: "short", day: "numeric" }) },
    { label: "Next Month", value: toDateStr(nextMonth), sublabel: nextMonth.toLocaleDateString("en-US", { month: "short", day: "numeric" }) },
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
  const firstDow = startOfMonth(viewDate).getDay();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = value ? parseDate(value) : null;

  const prevMonth = () => onViewDateChange(new Date(year, month - 1, 1));
  const nextMonth = () => onViewDateChange(new Date(year, month + 1, 1));

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  return (
    <div className="p-3">
      {/* Month/Year nav */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} className="p-1.5 rounded-md text-dungeon-400 hover:text-slate-100 hover:bg-dungeon-700 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span className="text-xs font-semibold text-slate-200">{MONTHS[month]} {year}</span>
        <button type="button" onClick={nextMonth} className="p-1.5 rounded-md text-dungeon-400 hover:text-slate-100 hover:bg-dungeon-700 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-dungeon-500 py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const cellDate = new Date(year, month, day);
          const isToday = isSameDay(cellDate, today);
          const isSelected = selected && isSameDay(cellDate, selected);
          const isPast = cellDate < today && !isToday;

          return (
            <button
              key={day}
              type="button"
              onClick={() => onChange(toDateStr(cellDate))}
              className={`w-8 h-8 rounded-md text-xs font-medium transition-all ${
                isSelected
                  ? "bg-red-500/30 text-red-300 ring-1 ring-red-400/60"
                  : isToday
                  ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                  : isPast
                  ? "text-dungeon-600 hover:bg-dungeon-700 hover:text-dungeon-400"
                  : "text-slate-300 hover:bg-dungeon-700"
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
  /** Show relative date info (default true) */
  showRelative?: boolean;
  /** Compact mode: shows as a clickable chip that expands into a dropdown (for sidebars). Default false (always expanded). */
  compact?: boolean;
}

export default function DatePicker({ value, onChange, showRelative = true, compact = false }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"presets" | "calendar">("presets");
  const [viewDate, setViewDate] = useState<Date>(() =>
    value ? parseDate(value) : new Date()
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const presets = useMemo(() => getPresets(), []);
  const display = useMemo(() => formatDateDisplay(value), [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Sync viewDate when value changes externally
  useEffect(() => {
    if (value) setViewDate(parseDate(value));
  }, [value]);

  const handleSelect = (v: string) => {
    onChange(v);
    if (v) setViewDate(parseDate(v));
    if (compact) setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    if (compact) setOpen(false);
  };

  // ─── Compact mode: chip trigger + dropdown ─────────────────────────────
  if (compact) {
    return (
      <div ref={containerRef} className="relative">
        {/* Trigger chip */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
            !value
              ? "bg-dungeon-800 border-dungeon-700 text-dungeon-500 hover:text-slate-300 hover:border-dungeon-600"
              : display.color.includes("red")
              ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/15"
              : display.color.includes("amber")
              ? "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/15"
              : display.color.includes("emerald")
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15"
              : "bg-dungeon-800 border-dungeon-700 text-slate-300 hover:border-dungeon-600"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {value ? (
            <>
              <span>{display.relative}</span>
              <span className="text-dungeon-500 text-xs">{display.absolute}</span>
            </>
          ) : (
            <span>Set date</span>
          )}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-40 ml-auto">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute left-0 top-full mt-1.5 z-30 bg-dungeon-900 border border-dungeon-700 rounded-xl shadow-2xl shadow-black/40 w-[280px] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
            {/* Tabs */}
            <div className="flex border-b border-dungeon-700">
              <button
                type="button"
                onClick={() => setActiveTab("presets")}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  activeTab === "presets" ? "text-slate-100 border-b-2 border-red-500" : "text-dungeon-400 hover:text-slate-300"
                }`}
              >
                Quick Pick
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("calendar")}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  activeTab === "calendar" ? "text-slate-100 border-b-2 border-red-500" : "text-dungeon-400 hover:text-slate-300"
                }`}
              >
                Calendar
              </button>
            </div>

            {activeTab === "presets" ? (
              <div className="p-2">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleSelect(p.value)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                      value === p.value
                        ? "bg-red-500/15 text-red-300"
                        : "text-slate-300 hover:bg-dungeon-700"
                    }`}
                  >
                    <span className="font-medium">{p.label}</span>
                    <span className="text-xs text-dungeon-500">{p.sublabel}</span>
                  </button>
                ))}
                {/* Clear option */}
                {value && (
                  <>
                    <div className="border-t border-dungeon-700 my-1" />
                    <button
                      type="button"
                      onClick={handleClear}
                      className="w-full flex items-center px-3 py-2 rounded-lg text-sm text-dungeon-400 hover:text-red-400 hover:bg-dungeon-700 transition-all"
                    >
                      Remove date
                    </button>
                  </>
                )}
              </div>
            ) : (
              <CalendarGrid
                value={value}
                onChange={handleSelect}
                viewDate={viewDate}
                onViewDateChange={setViewDate}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Default mode: always-visible presets (for forms) ──────────────────
  return (
    <div ref={containerRef} className="space-y-1.5">
      {/* Preset pills + calendar toggle */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handleSelect(p.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              value === p.value
                ? "bg-red-500/20 text-red-300 ring-2 ring-red-400/60 border-transparent"
                : "bg-dungeon-700 text-slate-300 border-dungeon-600 hover:ring-1 hover:ring-dungeon-500"
            }`}
          >
            {p.label}
          </button>
        ))}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1.5 rounded-full text-xs font-medium border bg-dungeon-700 text-dungeon-400 border-dungeon-600 hover:text-red-400 hover:border-red-500/30 transition-all"
          >
            Clear
          </button>
        )}
        {/* Calendar icon toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`p-1.5 rounded-full border transition-all ${
            open
              ? "bg-red-500/20 text-red-300 ring-2 ring-red-400/60 border-transparent"
              : "bg-dungeon-700 text-dungeon-400 border-dungeon-600 hover:text-slate-200 hover:ring-1 hover:ring-dungeon-500"
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

      {/* Date context line */}
      {showRelative && value && (
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${display.color}`}>{display.relative}</span>
          <span className="text-[11px] text-dungeon-500">{display.absolute}</span>
        </div>
      )}

      {/* Calendar dropdown */}
      {open && (
        <div className="mt-1 bg-dungeon-800/80 border border-dungeon-700 rounded-lg w-[260px]">
          <CalendarGrid
            value={value}
            onChange={(v) => { handleSelect(v); setOpen(false); }}
            viewDate={viewDate}
            onViewDateChange={setViewDate}
          />
        </div>
      )}
    </div>
  );
}
