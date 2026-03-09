"use client";

import React, { useState, useEffect, useRef } from "react";
import RecurrenceEditor from "@/components/tasks/RecurrenceEditor";
import { useTaskConfig } from "@/hooks/useTaskConfig";
import { InlineTagEditor } from "@/components/tasks/InlineFieldEditors";

interface RoutineData {
  id: string;
  title: string;
  description?: string;
  frequency: string;
  frequency_name: string;
  recurrence_rule?: string;
  owner_ids?: string[];
  owners?: { id: string; full_name: string; avatar_url?: string | null }[];
  assignee?: { id: string; full_name: string; avatar_url?: string | null };
  streak_current: number;
  streak_longest: number;
  is_habit: boolean;
  tags?: any[];
  created_at: string;
  completions: Record<string, boolean>;
}

interface Props {
  routineId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

function getInitials(name?: string): string {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function RoutineDetail({ routineId, onClose, onUpdated }: Props) {
  const [routine, setRoutine] = useState<RoutineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editingRecurrence, setEditingRecurrence] = useState(false);
  const pendingOwnerIdsRef = useRef<string[] | null>(null);

  const { config } = useTaskConfig();

  const fetchRoutine = async () => {
    try {
      setLoading(true);
      // Fetch from the week endpoint and find our routine
      const res = await fetch(`/api/routines/week`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const found = (data.routines || []).find((r: any) => r.id === routineId);
      if (found) {
        // Also fetch full task detail for description etc.
        const taskRes = await fetch(`/api/tasks/${routineId}`);
        if (taskRes.ok) {
          const taskData = await taskRes.json();
          setRoutine({ ...found, description: taskData.task?.description });
        } else {
          setRoutine(found);
        }
      }
    } catch (err) {
      console.error("Failed to fetch routine:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutine();
  }, [routineId]);

  const handlePatch = async (patch: Record<string, unknown>) => {
    if (!routine) return;
    try {
      const res = await fetch(`/api/tasks/${routine.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Update failed");
      onUpdated?.();
      fetchRoutine();
    } catch (err) {
      console.error("Patch failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-dungeon-700 border-t-red-500 rounded-full" />
      </div>
    );
  }

  if (!routine) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-400">Routine not found</p>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-dungeon-800 hover:bg-dungeon-700 text-slate-100 rounded transition-colors">
          Close
        </button>
      </div>
    );
  }

  // Build frequency-appropriate completion history
  const freq = routine.frequency;
  const historyPeriods: { label: string; done: boolean; tooltip: string }[] = [];

  if (freq === "daily") {
    // Last 14 days
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      historyPeriods.push({
        label: d.toLocaleDateString("en-US", { weekday: "narrow" }),
        done: !!routine.completions[ds],
        tooltip: `${ds}${routine.completions[ds] ? " - Done" : ""}`,
      });
    }
  } else if (freq === "weekly" || freq === "biweekly") {
    // Last 14 weeks
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      // Get Mon-Sun of that week
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const ws = new Date(d);
      ws.setDate(ws.getDate() + diff);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      const wsStr = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, "0")}-${String(ws.getDate()).padStart(2, "0")}`;
      const weStr = `${we.getFullYear()}-${String(we.getMonth() + 1).padStart(2, "0")}-${String(we.getDate()).padStart(2, "0")}`;
      const done = Object.keys(routine.completions).some((cd) => cd >= wsStr && cd <= weStr);
      historyPeriods.push({
        label: `W${Math.ceil(ws.getDate() / 7)}`,
        done,
        tooltip: `Week of ${ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })}${done ? " - Done" : ""}`,
      });
    }
  } else {
    // Monthly/quarterly/yearly: last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const done = Object.keys(routine.completions).some((cd) => cd.startsWith(month));
      historyPeriods.push({
        label: d.toLocaleDateString("en-US", { month: "narrow" }),
        done,
        tooltip: `${d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}${done ? " - Done" : ""}`,
      });
    }
  }

  const historyLabel = freq === "daily" ? "Last 14 Days" : freq === "weekly" || freq === "biweekly" ? "Last 14 Weeks" : "Last 12 Months";

  return (
    <div className="bg-dungeon-900 border-l border-dungeon-800 w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-dungeon-900 border-b border-dungeon-800 sticky top-0 z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                type="text"
                defaultValue={routine.title}
                onBlur={(e) => {
                  setEditingTitle(false);
                  if (e.currentTarget.value.trim() && e.currentTarget.value.trim() !== routine.title) {
                    handlePatch({ title: e.currentTarget.value.trim() });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  }
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                autoFocus
                className="w-full bg-dungeon-800 border border-red-400 rounded px-3 py-2 text-xl font-semibold text-slate-100 focus:outline-none"
              />
            ) : (
              <h1
                onClick={() => setEditingTitle(true)}
                className="text-2xl font-bold text-slate-100 cursor-pointer hover:text-red-400 transition-colors truncate"
              >
                {routine.title}
              </h1>
            )}
          </div>
          <button onClick={onClose} className="text-dungeon-400 hover:text-slate-100 transition-colors p-1.5">
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Streak */}
          <div className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-4">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-400 font-mono">{routine.streak_current}</div>
                <div className="text-[10px] text-dungeon-500 uppercase">Current</div>
              </div>
              <div className="w-px h-8 bg-dungeon-700" />
              <div className="text-center">
                <div className="text-2xl font-bold text-dungeon-400 font-mono">{routine.streak_longest}</div>
                <div className="text-[10px] text-dungeon-500 uppercase">Best</div>
              </div>
              <div className="w-px h-8 bg-dungeon-700" />
              <div className="text-center">
                <div className="text-lg font-semibold text-slate-300">{routine.frequency_name}</div>
                <div className="text-[10px] text-dungeon-500 uppercase">Frequency</div>
              </div>
            </div>
          </div>

          {/* Completion history — frequency-aware */}
          <div className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-dungeon-400 uppercase tracking-wider mb-3">{historyLabel}</h3>
            <div className="flex gap-1">
              {historyPeriods.map((p, i) => (
                <div
                  key={i}
                  className={`flex-1 h-6 rounded-sm ${
                    p.done ? "bg-green-500" : "bg-dungeon-700/50"
                  }`}
                  title={p.tooltip}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1">
              {historyPeriods.length > 0 && (
                <>
                  <span className="text-[9px] text-dungeon-600">{historyPeriods[0].label}</span>
                  <span className="text-[9px] text-dungeon-600">Now</span>
                </>
              )}
            </div>
          </div>

          {/* Meta card */}
          <div className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-4 space-y-4">
            {/* Recurrence */}
            <div className="flex items-start gap-3">
              <span className="text-dungeon-500 text-sm mt-0.5">🔄</span>
              <div className="flex-1">
                <p className="text-xs text-dungeon-400 mb-1">Recurrence</p>
                {editingRecurrence ? (
                  <div className="space-y-3">
                    <RecurrenceEditor
                      value={routine.recurrence_rule}
                      onChange={(rule) => {
                        handlePatch({ recurrence_rule: rule || null });
                      }}
                    />
                    <button
                      onClick={() => setEditingRecurrence(false)}
                      className="text-xs text-dungeon-500 hover:text-slate-300 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingRecurrence(true)}
                    className="text-sm font-medium text-slate-100 hover:text-red-400 transition-colors"
                  >
                    {routine.frequency_name}
                  </button>
                )}
              </div>
            </div>

            {/* Owners */}
            {config && (
              <div className="flex items-start gap-3">
                <span className="text-dungeon-500 text-sm mt-1">👥</span>
                <div className="flex-1">
                  <p className="text-xs text-dungeon-400 mb-1.5">Owners</p>
                  <div className="flex flex-wrap gap-1.5">
                    {config.members.map((m: any) => {
                      const name = m.user?.full_name || m.display_name || m.user_id;
                      const currentOwnerIds = routine.owner_ids || [];
                      const isOwner = currentOwnerIds.includes(m.user_id);
                      return (
                        <button
                          key={m.user_id}
                          onClick={async () => {
                            const latestOwnerIds = pendingOwnerIdsRef.current || routine.owner_ids || [];
                            const nextIds = latestOwnerIds.includes(m.user_id)
                              ? latestOwnerIds.filter((id: string) => id !== m.user_id)
                              : [...latestOwnerIds, m.user_id];
                            pendingOwnerIdsRef.current = nextIds;
                            await handlePatch({ owner_ids: nextIds });
                            pendingOwnerIdsRef.current = null;
                          }}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition-all ${
                            isOwner
                              ? "bg-crimson-900/30 border-crimson-700 text-crimson-300"
                              : "bg-dungeon-800 border-dungeon-700 text-dungeon-400 hover:text-slate-200 hover:border-dungeon-600"
                          }`}
                        >
                          <span className="w-4 h-4 rounded-full bg-dungeon-600 flex items-center justify-center text-[8px] font-semibold flex-shrink-0">
                            {getInitials(name)}
                          </span>
                          {isOwner ? "- " : "+ "}{name.split(" ")[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Tags */}
            <div className="flex items-start gap-3">
              <span className="text-dungeon-500 text-sm mt-1">🏷️</span>
              <div className="flex-1">
                <p className="text-xs text-dungeon-400 mb-2">Tags</p>
                <InlineTagEditor
                  taskId={routine.id}
                  currentTags={routine.tags || []}
                  availableTags={config?.tags || []}
                  onUpdated={() => {
                    onUpdated?.();
                    fetchRoutine();
                  }}
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Description</h3>
            {editingDescription ? (
              <textarea
                defaultValue={routine.description ?? ""}
                onBlur={(e) => {
                  setEditingDescription(false);
                  handlePatch({ description: e.currentTarget.value.trim() || null });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingDescription(false);
                }}
                autoFocus
                rows={4}
                className="w-full bg-dungeon-700 border border-red-400 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none resize-none"
              />
            ) : (
              <div
                onClick={() => setEditingDescription(true)}
                className="text-sm text-slate-300 whitespace-pre-wrap cursor-pointer hover:bg-dungeon-700/50 rounded px-2 py-1.5 -mx-2 -my-1.5 transition-colors"
              >
                {routine.description || (
                  <span className="text-dungeon-500 italic">Click to add description...</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
