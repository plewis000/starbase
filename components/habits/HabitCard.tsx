"use client";

import React from "react";

interface HabitCardProps {
  habit: {
    id: string;
    title: string;
    status: string;
    current_streak: number;
    longest_streak: number;
    total_completions: number;
    checked_today?: boolean;
    frequency?: { name: string } | null;
    category?: { name: string; icon?: string } | null;
  };
  onSelect: (id: string) => void;
  onCheckIn: (id: string) => void;
  isSelected?: boolean;
}

export default function HabitCard({ habit, onSelect, onCheckIn, isSelected = false }: HabitCardProps) {
  const handleCheckIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCheckIn(habit.id);
  };

  return (
    <div
      onClick={() => onSelect(habit.id)}
      className={`flex items-center gap-4 p-4 bg-slate-900 border rounded-lg cursor-pointer transition-all hover:bg-slate-800/50 ${
        isSelected ? "border-red-400 border-l-4" : "border-slate-800 hover:border-slate-700"
      }`}
    >
      {/* Check-in button */}
      <button
        onClick={handleCheckIn}
        className={`w-10 h-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          habit.checked_today
            ? "border-red-400 bg-red-400/20 text-red-400"
            : "border-slate-600 hover:border-red-400/50 text-slate-600 hover:text-red-400/50"
        }`}
      >
        {habit.checked_today ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="text-slate-100 font-medium truncate">{habit.title}</h3>
        <div className="flex items-center gap-3 mt-1">
          {habit.frequency && (
            <span className="text-xs text-slate-400">{habit.frequency.name}</span>
          )}
          {habit.category && (
            <span className="text-xs text-slate-500">
              {habit.category.icon} {habit.category.name}
            </span>
          )}
        </div>
      </div>

      {/* Streak */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {habit.current_streak > 0 && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/10 border border-amber-400/20">
            <span className="text-sm">🔥</span>
            <span className="text-sm font-bold text-amber-400">{habit.current_streak}</span>
          </div>
        )}
        {habit.status === "paused" && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-400/30">
            paused
          </span>
        )}
      </div>
    </div>
  );
}
