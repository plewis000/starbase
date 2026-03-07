"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

interface MultiSelectOption {
  label: string;
  value: string;
  color?: string;
}

interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

export default function MultiSelect({ label, options, selected, onChange, placeholder = "All" }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const toggle = useCallback((value: string) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(next);
  }, [selected, onChange]);

  const displayText = selected.length === 0
    ? placeholder
    : selected.length <= 2
      ? selected.join(", ")
      : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 uppercase tracking-wider">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-2 py-1.5 bg-dungeon-900 border border-dungeon-800 rounded text-xs text-slate-200 focus:outline-none focus:border-crimson-500 cursor-pointer text-left flex items-center justify-between gap-1"
      >
        <span className="truncate">{displayText}</span>
        <span className="text-slate-500 text-[10px] flex-shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full min-w-[140px] bg-dungeon-900 border border-dungeon-700 rounded-lg shadow-xl py-1 max-h-[200px] overflow-auto">
          {options.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-dungeon-800 transition-colors text-left"
              >
                <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                  checked ? "bg-crimson-600 border-crimson-500" : "border-dungeon-600"
                }`}>
                  {checked && <span className="text-white text-[9px]">✓</span>}
                </span>
                {opt.color && (
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                )}
                <span className="text-slate-200">{opt.label}</span>
              </button>
            );
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-center px-2 py-1.5 text-[10px] text-slate-500 hover:text-slate-300 border-t border-dungeon-800 mt-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
