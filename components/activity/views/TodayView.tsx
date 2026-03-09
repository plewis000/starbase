"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";

interface Task {
  id: string;
  title: string;
  due_date?: string;
  completed_at?: string | null;
  is_habit?: boolean;
  streak_current?: number;
  streak_longest?: number;
  checked_today?: boolean;
  frequency_name?: string;
  recurrence_rule?: string;
  status_id?: string;
  priority?: { id: string; name: string; color?: string; icon?: string; sort_order: number };
  tags?: { id: string; name: string; display_color?: string }[];
  owner_ids?: string[];
  owners?: { id: string; full_name: string }[];
}

interface Props {
  tasks: Task[];
  onQuickComplete: (id: string) => void;
  onHabitCheckIn: (id: string) => void;
  completedTaskId: string | null;
  onSelect?: (id: string) => void;
}

export default function TodayView({ tasks, onQuickComplete, onHabitCheckIn, completedTaskId, onSelect }: Props) {
  const today = new Date().toISOString().split("T")[0];

  // Split into habits and regular tasks
  const habits = tasks.filter((t) => t.is_habit);
  const regularTasks = tasks.filter((t) => !t.is_habit);

  // Count completions
  const habitsDone = habits.filter((t) => t.checked_today).length;
  const tasksDone = regularTasks.filter((t) => !!t.completed_at).length;
  const totalItems = habits.length + regularTasks.length;
  const totalDone = habitsDone + tasksDone;
  const completionRate = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Progress bar */}
      {totalItems > 0 && (
        <div className="bg-dungeon-900 rounded-lg p-4 border border-dungeon-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-100">
              {completionRate === 100
                ? "All done today!"
                : completionRate >= 75
                ? "Almost there!"
                : completionRate >= 50
                ? "Keep it up!"
                : "Today's Progress"}
            </span>
            <span
              className={`text-sm font-bold ${
                completionRate === 100 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {totalDone}/{totalItems}
            </span>
          </div>
          <div className="w-full bg-dungeon-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                completionRate === 100 ? "bg-emerald-400" : "bg-red-400"
              }`}
              style={{ width: `${completionRate}%` }}
            />
          </div>
          <p className="text-xs text-dungeon-500 mt-2">
            {totalDone === 0
              ? "Start your day — check off your first item"
              : completionRate === 100
              ? "You're on fire! Everything done."
              : `${totalItems - totalDone} item${totalItems - totalDone > 1 ? "s" : ""} remaining`}
          </p>
        </div>
      )}

      {/* Habits section */}
      {habits.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-dungeon-400 uppercase tracking-wider mb-3">
            Habits ({habitsDone}/{habits.length})
          </h2>
          <div className="space-y-1.5">
            {habits.map((habit) => (
              <div
                key={habit.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all hover:bg-dungeon-800/50 ${
                  habit.checked_today
                    ? "bg-dungeon-900/50 border-dungeon-800/50"
                    : "bg-dungeon-900 border-dungeon-800 hover:border-dungeon-700"
                }`}
              >
                {/* Check-in button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onHabitCheckIn(habit.id);
                  }}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    habit.checked_today
                      ? "border-emerald-400 bg-emerald-400/20 text-emerald-400"
                      : "border-dungeon-600 hover:border-red-400/50 text-dungeon-600 hover:text-red-400/50"
                  }`}
                >
                  {habit.checked_today ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </button>

                {/* Title + meta */}
                <div
                  className="flex-1 min-w-0"
                  onClick={() => onSelect?.(habit.id)}
                >
                  <span
                    className={`text-sm font-medium truncate block ${
                      habit.checked_today ? "text-dungeon-500 line-through" : "text-slate-100"
                    }`}
                  >
                    {habit.title}
                  </span>
                  {habit.frequency_name && (
                    <span className="text-xs text-dungeon-500">{habit.frequency_name}</span>
                  )}
                </div>

                {/* Tags */}
                {habit.tags && habit.tags.length > 0 && (
                  <div className="flex gap-1 flex-shrink-0">
                    {habit.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag.id}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium text-dungeon-400 bg-dungeon-800 border border-dungeon-700"
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Streak */}
                {(habit.streak_current || 0) > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 flex-shrink-0">
                    <span className="text-xs">🔥</span>
                    <span className="text-xs font-bold text-amber-400">{habit.streak_current}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks section */}
      {regularTasks.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-dungeon-400 uppercase tracking-wider mb-3">
            Tasks ({tasksDone}/{regularTasks.length})
          </h2>
          <div className="space-y-1.5">
            {regularTasks.map((task) => {
              const isDone = !!task.completed_at;
              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all hover:bg-dungeon-800/50 ${
                    isDone
                      ? "bg-dungeon-900/50 border-dungeon-800/50"
                      : "bg-dungeon-900 border-dungeon-800 hover:border-dungeon-700"
                  }`}
                >
                  {/* Complete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickComplete(task.id);
                    }}
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isDone
                        ? "border-emerald-400 bg-emerald-400/20 text-emerald-400"
                        : "border-dungeon-600 hover:border-red-400/50 text-dungeon-600 hover:text-red-400/50"
                    }`}
                  >
                    {isDone ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                  </button>

                  {/* Title + meta */}
                  <div
                    className="flex-1 min-w-0"
                    onClick={() => onSelect?.(task.id)}
                  >
                    <span
                      className={`text-sm font-medium truncate block ${
                        isDone ? "text-dungeon-500 line-through" : "text-slate-100"
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>

                  {/* Priority pill */}
                  {task.priority && task.priority.name !== "None" && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                      style={{
                        color: task.priority.color || "#94a3b8",
                        backgroundColor: `${task.priority.color || "#94a3b8"}15`,
                        borderColor: `${task.priority.color || "#94a3b8"}30`,
                        borderWidth: 1,
                      }}
                    >
                      {task.priority.icon || ""} {task.priority.name}
                    </span>
                  )}

                  {/* Tags */}
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex gap-1 flex-shrink-0">
                      {task.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag.id}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium text-dungeon-400 bg-dungeon-800 border border-dungeon-700"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalItems === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <div className="text-4xl mb-3">✨</div>
          <p className="text-slate-400 text-sm">Nothing due today</p>
          <p className="text-slate-600 text-xs mt-1">Enjoy the free time, or add tasks from the list view</p>
        </div>
      )}
    </div>
  );
}
