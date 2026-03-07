"use client";

import React, { useState, useEffect } from "react";

type Frequency = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";

interface ParsedRule {
  freq: Frequency;
  interval: number;
  byDay: string[];
  byMonthDay?: number;
}

const DAY_OPTIONS = [
  { value: "SU", label: "S" },
  { value: "MO", label: "M" },
  { value: "TU", label: "T" },
  { value: "WE", label: "W" },
  { value: "TH", label: "T" },
  { value: "FR", label: "F" },
  { value: "SA", label: "S" },
];

export function parseRRule(rule: string): ParsedRule {
  if (!rule) return { freq: "NONE", interval: 1, byDay: [] };
  const parts = Object.fromEntries(rule.split(";").map((p) => p.split("=")));
  return {
    freq: (parts.FREQ as Frequency) || "NONE",
    interval: parts.INTERVAL ? parseInt(parts.INTERVAL) : 1,
    byDay: parts.BYDAY ? parts.BYDAY.split(",") : [],
    byMonthDay: parts.BYMONTHDAY ? parseInt(parts.BYMONTHDAY) : undefined,
  };
}

export function buildRRule(parsed: ParsedRule): string {
  if (parsed.freq === "NONE") return "";
  const parts: string[] = [`FREQ=${parsed.freq}`];
  if (parsed.interval > 1) parts.push(`INTERVAL=${parsed.interval}`);
  else parts.push(`INTERVAL=1`);
  if (parsed.freq === "WEEKLY" && parsed.byDay.length > 0) {
    parts.push(`BYDAY=${parsed.byDay.join(",")}`);
  }
  if (parsed.freq === "MONTHLY" && parsed.byMonthDay) {
    parts.push(`BYMONTHDAY=${parsed.byMonthDay}`);
  }
  return parts.join(";");
}

interface RecurrenceEditorProps {
  value?: string;
  onChange: (rule: string) => void;
}

export default function RecurrenceEditor({ value, onChange }: RecurrenceEditorProps) {
  const [parsed, setParsed] = useState<ParsedRule>(() => parseRRule(value || ""));

  useEffect(() => {
    setParsed(parseRRule(value || ""));
  }, [value]);

  const update = (patch: Partial<ParsedRule>) => {
    const next = { ...parsed, ...patch };
    // Reset day selections when changing frequency
    if (patch.freq && patch.freq !== parsed.freq) {
      next.byDay = [];
      next.byMonthDay = undefined;
    }
    setParsed(next);
    onChange(buildRRule(next));
  };

  const toggleDay = (day: string) => {
    const byDay = parsed.byDay.includes(day)
      ? parsed.byDay.filter((d) => d !== day)
      : [...parsed.byDay, day];
    update({ byDay });
  };

  const freqLabel: Record<string, string> = { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months" };

  return (
    <div className="space-y-4">
      {/* Frequency buttons */}
      <div>
        <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Frequency</p>
        <div className="flex gap-1.5">
          {(["NONE", "DAILY", "WEEKLY", "MONTHLY"] as Frequency[]).map((freq) => (
            <button
              key={freq}
              onClick={() => update({ freq })}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all min-h-[44px] ${
                parsed.freq === freq
                  ? "bg-red-500 text-white"
                  : "bg-dungeon-800 text-slate-400 hover:text-slate-200 border border-dungeon-700"
              }`}
            >
              {freq === "NONE" ? "None" : freq.charAt(0) + freq.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Interval */}
      {parsed.freq !== "NONE" && (
        <div>
          <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Interval</p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-300">Every</span>
            <input
              type="number"
              min={1}
              max={99}
              value={parsed.interval}
              onChange={(e) => update({ interval: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-16 bg-dungeon-800 border border-dungeon-700 rounded px-2 py-2 text-sm text-slate-100 text-center focus:outline-none focus:border-red-400 min-h-[44px]"
            />
            <span className="text-sm text-slate-300">{freqLabel[parsed.freq] || ""}</span>
          </div>
        </div>
      )}

      {/* Weekday picker (Weekly only) — reuses habit day-of-week pattern */}
      {parsed.freq === "WEEKLY" && (
        <div>
          <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Days</p>
          <div className="flex gap-2 flex-wrap">
            {DAY_OPTIONS.map((day) => (
              <button
                key={day.value}
                onClick={() => toggleDay(day.value)}
                className={`w-10 h-10 rounded-full text-sm font-semibold transition-all ${
                  parsed.byDay.includes(day.value)
                    ? "bg-red-400 text-slate-950"
                    : "bg-dungeon-800 text-slate-400 hover:text-slate-200 border border-dungeon-700"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Monthly day picker */}
      {parsed.freq === "MONTHLY" && (
        <div>
          <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Day of month</p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-300">On day</span>
            <input
              type="number"
              min={1}
              max={31}
              value={parsed.byMonthDay || 1}
              onChange={(e) => update({ byMonthDay: Math.max(1, Math.min(31, parseInt(e.target.value) || 1)) })}
              className="w-16 bg-dungeon-800 border border-dungeon-700 rounded px-2 py-2 text-sm text-slate-100 text-center focus:outline-none focus:border-red-400 min-h-[44px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
