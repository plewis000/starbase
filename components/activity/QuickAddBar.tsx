"use client";

import React, { useState, useRef } from "react";

// NLP date extraction from task title
function parseQuickAddDate(input: string): { title: string; dueDate: string | null } {
  const today = new Date();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  const patterns: [RegExp, () => Date][] = [
    [/\b(today)\b/i, () => today],
    [/\b(tonight)\b/i, () => today],
    [/\b(tomorrow)\b/i, () => { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }],
    ...dayNames.map((day, i) => [
      new RegExp(`\\b(${day})\\b`, "i"),
      () => {
        const d = new Date(today);
        const diff = (i - today.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        return d;
      },
    ] as [RegExp, () => Date]),
  ];

  for (const [pattern, getDate] of patterns) {
    if (pattern.test(input)) {
      const title = input.replace(pattern, "").replace(/\s+/g, " ").trim();
      const date = getDate();
      const dueDate = date.toISOString().split("T")[0];
      return { title: title || input, dueDate };
    }
  }

  return { title: input, dueDate: null };
}

interface QuickAddBarProps {
  onAdd: (title: string, dueDate?: string) => Promise<boolean>;
}

export default function QuickAddBar({ onAdd }: QuickAddBarProps) {
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<"success" | "error" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const raw = value.trim();
    if (!raw || adding) return;

    const { title, dueDate } = parseQuickAddDate(raw);
    setAdding(true);

    const ok = await onAdd(title, dueDate || undefined);

    if (ok) {
      setValue("");
      setFlash("success");
    } else {
      setFlash("error");
    }

    setTimeout(() => setFlash(null), 1500);
    setAdding(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex gap-2 items-center">
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder='Quick add — "Buy groceries tomorrow"'
          disabled={adding}
          className={`w-full bg-slate-900/80 border rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all disabled:opacity-50 ${
            flash === "success"
              ? "border-green-500/50 ring-1 ring-green-500/20"
              : flash === "error"
              ? "border-red-500/50 ring-1 ring-red-500/20"
              : "border-slate-800 focus:border-crimson-500/50 focus:ring-1 focus:ring-crimson-500/20"
          }`}
        />
        {/* Detected date hint */}
        {value.trim() && parseQuickAddDate(value.trim()).dueDate && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-400/70 font-mono pointer-events-none">
            {parseQuickAddDate(value.trim()).dueDate}
          </span>
        )}
      </div>
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || adding}
        className="px-3 py-2 bg-crimson-600 hover:bg-crimson-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-medium rounded-lg transition-all flex-shrink-0"
      >
        {adding ? "..." : "+"}
      </button>
    </div>
  );
}
