"use client";

import React from "react";

interface GoalCardProps {
  goal: {
    id: string;
    title: string;
    status: string;
    progress_type: string;
    progress_value: number;
    target_date?: string;
    category?: { name: string; icon?: string } | null;
    milestones?: { id: string; completed_at?: string }[];
  };
  onSelect: (id: string) => void;
  isSelected?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  active: "text-red-400 bg-red-400/10 border-red-400/30",
  completed: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  paused: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  abandoned: "text-slate-400 bg-slate-400/10 border-slate-400/30",
};

const PROGRESS_COLORS: Record<string, string> = {
  active: "bg-red-400",
  completed: "bg-blue-400",
  paused: "bg-amber-400",
  abandoned: "bg-slate-500",
};

const formatRelativeDate = (dateString?: string): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Due today";
  if (diffDays <= 30) return `${diffDays}d left`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function GoalCard({ goal, onSelect, isSelected = false }: GoalCardProps) {
  const progressPercent = Math.min(100, Math.round(goal.progress_value));
  const milestonesCompleted = (goal.milestones || []).filter((m) => m.completed_at).length;
  const milestonesTotal = (goal.milestones || []).length;

  return (
    <div
      onClick={() => onSelect(goal.id)}
      className={`p-4 bg-slate-900 border rounded-lg cursor-pointer transition-all hover:bg-slate-800/50 ${
        isSelected ? "border-red-400 border-l-4" : "border-slate-800 hover:border-slate-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-slate-100 font-medium truncate">{goal.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[goal.status] || STATUS_COLORS.active}`}>
              {goal.status}
            </span>
            {goal.category && (
              <span className="text-xs text-slate-400">
                {goal.category.icon && <span className="mr-1">{goal.category.icon}</span>}
                {goal.category.name}
              </span>
            )}
          </div>
        </div>
        {goal.target_date && (
          <span className={`text-xs font-medium flex-shrink-0 ${
            goal.target_date && new Date(goal.target_date) < new Date() && goal.status === "active"
              ? "text-red-400"
              : "text-slate-400"
          }`}>
            {formatRelativeDate(goal.target_date)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">
            {goal.progress_type === "milestone" && milestonesTotal > 0
              ? `${milestonesCompleted}/${milestonesTotal} milestones`
              : `${progressPercent}%`}
          </span>
          <span className="text-slate-500">{goal.progress_type.replace("_", " ")}</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${PROGRESS_COLORS[goal.status] || "bg-red-400"}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
