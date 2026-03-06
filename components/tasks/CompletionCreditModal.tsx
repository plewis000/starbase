"use client";

import React, { useState, useEffect } from "react";
import { UserSummary } from "@/lib/types";

interface CompletionCreditModalProps {
  open: boolean;
  taskTitle: string;
  ownerIds: string[];
  /** @deprecated Use ownerIds instead */
  assigneeId?: string;
  /** @deprecated Use ownerIds instead */
  additionalOwnerIds?: string[];
  currentUserId: string;
  members: { user_id: string; user?: UserSummary | null; display_name?: string }[];
  onConfirm: (creditedTo: string[]) => void;
  onCancel: () => void;
}

const getInitials = (name?: string): string => {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
};

export default function CompletionCreditModal({
  open,
  taskTitle,
  ownerIds,
  assigneeId,
  additionalOwnerIds,
  currentUserId,
  members,
  onConfirm,
  onCancel,
}: CompletionCreditModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set([currentUserId]));

  // Reset selection when modal opens for a new task
  useEffect(() => {
    if (open) setSelected(new Set([currentUserId]));
  }, [open, currentUserId]);

  if (!open) return null;

  // Build candidate list from ownerIds (with legacy fallback) + current user
  const candidateIds = new Set<string>();
  const effectiveOwnerIds = ownerIds && ownerIds.length > 0
    ? ownerIds
    : [...(assigneeId ? [assigneeId] : []), ...(additionalOwnerIds || [])];
  for (const id of effectiveOwnerIds) candidateIds.add(id);
  candidateIds.add(currentUserId);

  const candidates = Array.from(candidateIds).map((id) => {
    const member = members.find((m) => m.user_id === id);
    return {
      id,
      name: member?.user?.full_name || member?.display_name || id,
      avatar_url: member?.user?.avatar_url,
    };
  });

  const completerIsOwner = effectiveOwnerIds.includes(currentUserId);

  // Case 1: Solo owner or unassigned — shouldn't show modal (caller handles this)
  // Case 2: 2 candidates, completer IS an owner → 3 quick buttons
  if (candidates.length === 2 && completerIsOwner) {
    const other = candidates.find((c) => c.id !== currentUserId)!;
    const firstName = other.name.split(" ")[0];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-slate-100 mb-1">Who did this?</h3>
          <p className="text-sm text-slate-400 mb-5 truncate">{taskTitle}</p>

          <div className="space-y-2">
            <button
              onClick={() => onConfirm([currentUserId])}
              className="w-full py-3 px-4 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 font-medium hover:border-red-500/50 hover:bg-slate-800/80 transition-all"
            >
              I did
            </button>
            <button
              onClick={() => onConfirm([other.id])}
              className="w-full py-3 px-4 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 font-medium hover:border-red-500/50 hover:bg-slate-800/80 transition-all"
            >
              {firstName} did
            </button>
            <button
              onClick={() => onConfirm([currentUserId, other.id])}
              className="w-full py-3 px-4 rounded-lg bg-red-900/30 border border-red-800/50 text-red-300 font-medium hover:bg-red-900/50 hover:border-red-700/50 transition-all"
            >
              We both did
            </button>
          </div>

          <button
            onClick={onCancel}
            className="w-full mt-3 py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Case 3 & 4: Multi-select with checkboxes (3+ people, or completer not an owner)
  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-100 mb-1">Who gets credit?</h3>
        <p className="text-sm text-slate-400 mb-5 truncate">{taskTitle}</p>

        <div className="space-y-2 mb-5">
          {candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => toggleSelected(c.id)}
              className={`w-full flex items-center gap-3 py-3 px-4 rounded-lg border transition-all ${
                selected.has(c.id)
                  ? "bg-red-900/20 border-red-800/50 text-slate-100"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
              }`}
            >
              {/* Checkbox */}
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                selected.has(c.id)
                  ? "bg-red-500 border-red-500 text-white"
                  : "border-slate-600"
              }`}>
                {selected.has(c.id) && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>

              {/* Avatar */}
              {c.avatar_url ? (
                <img src={c.avatar_url} alt={c.name} className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-semibold text-slate-200">
                  {getInitials(c.name)}
                </div>
              )}

              <span className="font-medium">
                {c.name}
                {c.id === currentUserId && <span className="text-slate-500 ml-1">(you)</span>}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={() => onConfirm(Array.from(selected))}
          disabled={selected.size === 0}
          className="w-full py-3 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirm ({selected.size})
        </button>

        <button
          onClick={onCancel}
          className="w-full mt-2 py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Determine if a task needs the credit modal before completion.
 * Returns false for solo-owner/unassigned tasks (auto-credit completer).
 */
export function needsCreditModal(
  ownerIds: string[],
): boolean {
  return ownerIds.length >= 2;
}
