"use client";

import React, { useState } from "react";

interface ConfigData {
  statuses?: { id: string; name: string }[];
  priorities?: { id: string; name: string }[];
  members?: { user_id: string; display_name?: string; user?: { full_name: string } | null }[];
  [key: string]: any;
}

interface BulkActionBarProps {
  selectedCount: number;
  config: ConfigData | null;
  onBulkUpdate: (patch: Record<string, unknown>) => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
}

export default function BulkActionBar({ selectedCount, config, onBulkUpdate, onBulkDelete, onClearSelection }: BulkActionBarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl px-4 py-2.5 flex items-center gap-3 animate-in slide-in-from-bottom duration-200">
      <span className="text-sm font-medium text-slate-200">
        {selectedCount} selected
      </span>

      <div className="w-px h-6 bg-slate-700" />

      {/* Status change */}
      {config?.statuses && (
        <select
          onChange={(e) => { if (e.target.value) { onBulkUpdate({ status_id: e.target.value }); e.target.value = ""; } }}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 cursor-pointer"
          defaultValue=""
        >
          <option value="" disabled>Status...</option>
          {config.statuses.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}

      {/* Priority change */}
      {config?.priorities && (
        <select
          onChange={(e) => { if (e.target.value) { onBulkUpdate({ priority_id: e.target.value }); e.target.value = ""; } }}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 cursor-pointer"
          defaultValue=""
        >
          <option value="" disabled>Priority...</option>
          {config.priorities.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}

      {/* Assignee change */}
      {config?.members && (
        <select
          onChange={(e) => { if (e.target.value !== "") { onBulkUpdate({ assigned_to: e.target.value || null }); e.target.value = ""; } }}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 cursor-pointer"
          defaultValue=""
        >
          <option value="" disabled>Assign...</option>
          <option value="">Unassigned</option>
          {config.members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.user?.full_name || m.display_name || m.user_id}</option>
          ))}
        </select>
      )}

      <div className="w-px h-6 bg-slate-700" />

      {/* Delete */}
      {showDeleteConfirm ? (
        <div className="flex items-center gap-1">
          <span className="text-xs text-red-400">Delete {selectedCount}?</span>
          <button
            onClick={() => { onBulkDelete(); setShowDeleteConfirm(false); }}
            className="px-2 py-1 bg-red-600 text-white text-xs rounded font-medium"
          >
            Yes
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="px-2 py-1 text-xs text-slate-400"
          >
            No
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Delete
        </button>
      )}

      {/* Clear selection */}
      <button
        onClick={onClearSelection}
        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
