"use client";

import React, { useState, useEffect, useRef } from "react";
import { useHouseholdTimezone } from "@/hooks/useHouseholdTimezone";

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  config: {
    statuses?: { id: string; name: string }[];
    priorities?: { id: string; name: string }[];
    members?: { user_id: string; display_name?: string; user?: { full_name: string } | null }[];
    task_types?: { id: string; name: string }[];
    effort_levels?: { id: string; name: string }[];
    tags?: { id: string; name: string; display_color?: string }[];
  } | null;
  onBulkUpdate: (patch: Record<string, unknown>) => void;
  onBulkArchive: () => void;
  onBulkTagAction: (action: "add" | "remove", tagId: string) => void;
  onClearSelection: () => void;
  onExitBulkMode: () => void;
}

// Reusable popover dropdown for status/priority/assignee/type/effort
function BulkSelect({
  label,
  options,
  onSelect,
  allowNone,
  disabled,
}: {
  label: string;
  options: { id: string; name: string }[];
  onSelect: (id: string | null) => void;
  allowNone?: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
          disabled
            ? "border-slate-700/50 text-slate-600 cursor-not-allowed"
            : "border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-slate-100 cursor-pointer"
        }`}
      >
        {label}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-[60] bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[130px] max-h-48 overflow-y-auto">
          {allowNone && (
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400 italic hover:bg-slate-700 transition-colors"
            >
              {allowNone}
            </button>
          )}
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { onSelect(opt.id); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Due date picker with presets
function BulkDatePicker({
  onBulkUpdate,
  disabled,
}: {
  onBulkUpdate: (patch: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { timezone } = useHouseholdTimezone();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const getDateStr = (days: number) => {
    // Use Intl.DateTimeFormat for reliable timezone-aware date formatting
    const now = new Date();
    const target = new Date(now.getTime() + days * 86400000);
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    return formatter.format(target); // Returns YYYY-MM-DD
  };

  const presets = [
    { label: "Today", action: () => onBulkUpdate({ due_date: getDateStr(0) }) },
    { label: "Tomorrow", action: () => onBulkUpdate({ due_date: getDateStr(1) }) },
    { label: "+1 Week", action: () => onBulkUpdate({ due_date: getDateStr(7) }) },
    { label: "Clear Date", action: () => onBulkUpdate({ due_date: null }) },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
          disabled
            ? "border-slate-700/50 text-slate-600 cursor-not-allowed"
            : "border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-slate-100 cursor-pointer"
        }`}
      >
        Due
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-[60] bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[140px]">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => { p.action(); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
            >
              {p.label}
            </button>
          ))}
          <div className="border-t border-slate-700 mt-1 pt-1 px-2 pb-1">
            <input
              type="date"
              onChange={(e) => {
                if (e.target.value) {
                  onBulkUpdate({ due_date: e.target.value });
                  setOpen(false);
                }
              }}
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Tag picker with add/remove per tag
function BulkTagPicker({
  tags,
  onBulkTagAction,
  disabled,
}: {
  tags: { id: string; name: string; display_color?: string }[];
  onBulkTagAction: (action: "add" | "remove", tagId: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
          disabled
            ? "border-slate-700/50 text-slate-600 cursor-not-allowed"
            : "border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-slate-100 cursor-pointer"
        }`}
      >
        Tags
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-[60] bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[200px] max-h-48 overflow-y-auto">
          {tags.length === 0 && (
            <span className="px-3 py-1.5 text-xs text-slate-500">No tags configured</span>
          )}
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700/50 transition-colors">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.display_color || "#64748b" }} />
              <span className="text-xs text-slate-200 flex-1 truncate">{tag.name}</span>
              <button
                onClick={() => onBulkTagAction("add", tag.id)}
                className="px-1.5 py-0.5 text-[10px] font-medium text-green-400 hover:bg-green-900/30 rounded transition-colors"
              >
                + Add
              </button>
              <button
                onClick={() => onBulkTagAction("remove", tag.id)}
                className="px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-900/30 rounded transition-colors"
              >
                - Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Archive button with two-step confirm
function ArchiveButton({
  selectedCount,
  onBulkArchive,
  disabled,
}: {
  selectedCount: number;
  onBulkArchive: () => void;
  disabled: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const prevCount = useRef(selectedCount);

  useEffect(() => {
    if (selectedCount !== prevCount.current) {
      setConfirming(false);
      prevCount.current = selectedCount;
    }
  }, [selectedCount]);

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-amber-400">Archive {selectedCount}?</span>
        <button
          onClick={() => { onBulkArchive(); setConfirming(false); }}
          className="px-2 py-1 bg-amber-600 text-white text-xs rounded font-medium hover:bg-amber-500 transition-colors"
        >
          Yes
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-2 py-1 text-xs text-slate-400 hover:text-slate-300"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => !disabled && setConfirming(true)}
      disabled={disabled}
      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
        disabled
          ? "border-amber-800/30 text-amber-800/50 cursor-not-allowed"
          : "border-amber-700 text-amber-400 hover:bg-amber-900/30 hover:text-amber-300 cursor-pointer"
      }`}
    >
      Archive
    </button>
  );
}

export default function BulkActionBar({
  selectedCount,
  totalCount,
  config,
  onBulkUpdate,
  onBulkArchive,
  onBulkTagAction,
  onClearSelection,
  onExitBulkMode,
}: BulkActionBarProps) {
  const disabled = selectedCount === 0;

  return (
    <div className="fixed bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl px-4 py-2.5 flex items-center gap-2 animate-in slide-in-from-bottom duration-200 overflow-x-auto max-w-[95vw]">
      {/* Count */}
      <span className="text-sm font-medium text-slate-200 whitespace-nowrap">
        {selectedCount} of {totalCount}
      </span>

      <div className="w-px h-6 bg-slate-700 flex-shrink-0" />

      {/* Status */}
      {config?.statuses && (
        <BulkSelect
          label="Status"
          options={config.statuses}
          onSelect={(id) => id && onBulkUpdate({ status_id: id })}
          disabled={disabled}
        />
      )}

      {/* Priority */}
      {config?.priorities && (
        <BulkSelect
          label="Priority"
          options={config.priorities}
          onSelect={(id) => id && onBulkUpdate({ priority_id: id })}
          disabled={disabled}
        />
      )}

      {/* Assignee */}
      {config?.members && (
        <BulkSelect
          label="Assign"
          options={config.members.map((m) => ({
            id: m.user_id,
            name: m.user?.full_name || m.display_name || m.user_id,
          }))}
          onSelect={(id) => onBulkUpdate({ assigned_to: id })}
          allowNone="Unassigned"
          disabled={disabled}
        />
      )}

      <div className="w-px h-6 bg-slate-700 flex-shrink-0" />

      {/* Type */}
      {config?.task_types && config.task_types.length > 0 && (
        <BulkSelect
          label="Type"
          options={config.task_types}
          onSelect={(id) => onBulkUpdate({ task_type_id: id })}
          allowNone="None"
          disabled={disabled}
        />
      )}

      {/* Effort */}
      {config?.effort_levels && config.effort_levels.length > 0 && (
        <BulkSelect
          label="Effort"
          options={config.effort_levels}
          onSelect={(id) => onBulkUpdate({ effort_level_id: id })}
          allowNone="None"
          disabled={disabled}
        />
      )}

      <div className="w-px h-6 bg-slate-700 flex-shrink-0" />

      {/* Due date */}
      <BulkDatePicker onBulkUpdate={onBulkUpdate} disabled={disabled} />

      {/* Tags */}
      {config?.tags && config.tags.length > 0 && (
        <BulkTagPicker
          tags={config.tags}
          onBulkTagAction={onBulkTagAction}
          disabled={disabled}
        />
      )}

      <div className="w-px h-6 bg-slate-700 flex-shrink-0" />

      {/* Archive */}
      <ArchiveButton
        selectedCount={selectedCount}
        onBulkArchive={onBulkArchive}
        disabled={disabled}
      />

      <div className="w-px h-6 bg-slate-700 flex-shrink-0" />

      {/* Clear selection */}
      <button
        onClick={onClearSelection}
        disabled={disabled}
        className={`px-2 py-1.5 text-xs whitespace-nowrap transition-colors ${
          disabled ? "text-slate-700 cursor-not-allowed" : "text-slate-500 hover:text-slate-300"
        }`}
      >
        Clear
      </button>

      {/* Exit bulk mode */}
      <button
        onClick={onExitBulkMode}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-slate-100 transition-all whitespace-nowrap"
      >
        Exit
      </button>
    </div>
  );
}
