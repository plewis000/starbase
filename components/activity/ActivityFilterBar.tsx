"use client";

import React, { useState, useCallback, useRef } from "react";
import MultiSelect from "@/components/ui/MultiSelect";

export type GroupBy = "none" | "assignee" | "priority" | "status";

export interface ActivityFilters {
  status?: string;
  priority?: string;
  due?: string;
  search?: string;
  sort?: string;
  direction?: "asc" | "desc";
  owner?: string;
  groupBy?: GroupBy;
  hideDoneDays?: number;
}

export interface SavedView {
  name: string;
  icon: string;
  filters: Partial<ActivityFilters>;
  isDefault?: boolean;
}

interface ConfigData {
  statuses?: { id: string; name: string; color?: string; sort_order: number }[];
  priorities?: { id: string; name: string; color?: string; sort_order: number }[];
  members?: { user_id: string; display_name?: string; user?: { full_name: string } | null }[];
  [key: string]: any;
}

interface Props {
  filters: ActivityFilters;
  onFilterChange: (f: ActivityFilters) => void;
  savedViews: SavedView[];
  onSaveView: (view: SavedView) => void;
  onDeleteView?: (viewName: string) => void;
  config?: ConfigData | null;
  onUpdateDefaultView?: (viewName: string, filters: Partial<ActivityFilters>) => void;
  onResetDefaultView?: (viewName: string) => void;
  hasViewOverride?: (viewName: string) => boolean;
}

const STATUS_COLORS: Record<string, string> = {
  "To Do": "#64748b",
  "In Progress": "#3b82f6",
  "Blocked": "#ef4444",
  "Done": "#22c55e",
  "Someday": "#a855f7",
};

const PRIORITY_COLORS: Record<string, string> = {
  "Urgent": "#ef4444",
  "High": "#f97316",
  "Medium": "#eab308",
  "Low": "#64748b",
};

function buildStatusMultiOptions(config?: ConfigData | null) {
  if (!config?.statuses?.length) {
    return [
      { label: "To Do", value: "To Do", color: STATUS_COLORS["To Do"] },
      { label: "In Progress", value: "In Progress", color: STATUS_COLORS["In Progress"] },
      { label: "Blocked", value: "Blocked", color: STATUS_COLORS["Blocked"] },
      { label: "Done", value: "Done", color: STATUS_COLORS["Done"] },
      { label: "Someday", value: "Someday", color: STATUS_COLORS["Someday"] },
    ];
  }
  return [...config.statuses]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({ label: s.name, value: s.name, color: s.color || STATUS_COLORS[s.name] }));
}

function buildPriorityMultiOptions(config?: ConfigData | null) {
  if (!config?.priorities?.length) {
    return [
      { label: "Urgent", value: "Urgent", color: PRIORITY_COLORS["Urgent"] },
      { label: "High", value: "High", color: PRIORITY_COLORS["High"] },
      { label: "Medium", value: "Medium", color: PRIORITY_COLORS["Medium"] },
      { label: "Low", value: "Low", color: PRIORITY_COLORS["Low"] },
    ];
  }
  return [...config.priorities]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ label: p.name, value: p.name, color: p.color || PRIORITY_COLORS[p.name] }));
}

const DUE_OPTIONS = [
  { label: "All", value: "All" },
  { label: "Today", value: "today" },
  { label: "This Week", value: "this_week" },
  { label: "Overdue", value: "overdue" },
  { label: "Upcoming", value: "upcoming" },
  { label: "No Date", value: "none" },
];

const SORT_OPTIONS = [
  { label: "Due Date", value: "due_date" },
  { label: "Priority", value: "priority_id" },
  { label: "Created", value: "created_at" },
  { label: "Title", value: "title" },
];

const GROUP_BY_OPTIONS = [
  { label: "None", value: "none" },
  { label: "Status", value: "status" },
  { label: "Priority", value: "priority" },
  { label: "Assignee", value: "assignee" },
];

const HIDE_DONE_OPTIONS = [
  { label: "Show All", value: "0" },
  { label: "> 7 days", value: "7" },
  { label: "> 14 days", value: "14" },
  { label: "> 30 days", value: "30" },
];

const EMOJI_PICKS = ["📋", "🔴", "📅", "📆", "🔥", "⭐", "🎯", "🏷️", "👤", "🚀", "💡", "🐛", "📌", "⚡", "🎨", "🔧"];

export default function ActivityFilterBar({
  filters,
  onFilterChange,
  savedViews,
  onSaveView,
  onDeleteView,
  config,
  onUpdateDefaultView,
  onResetDefaultView,
  hasViewOverride,
}: Props) {
  const statusOptions = buildStatusMultiOptions(config);
  const priorityOptions = buildPriorityMultiOptions(config);
  const [activeView, setActiveView] = useState<string | null>("All Tasks");
  const [expanded, setExpanded] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveIcon, setSaveIcon] = useState("⭐");
  const [editingView, setEditingView] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [viewMenuOpen, setViewMenuOpen] = useState<string | null>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Close view menu on outside click
  React.useEffect(() => {
    if (!viewMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [viewMenuOpen]);

  const update = useCallback((key: keyof ActivityFilters, value: string | number | undefined) => {
    const next = { ...filters, [key]: value };
    setActiveView(null);
    onFilterChange(next);
  }, [filters, onFilterChange]);

  const applyView = useCallback((view: SavedView) => {
    const next: ActivityFilters = { ...filters, ...view.filters, search: "" };
    setActiveView(view.name);
    onFilterChange(next);
  }, [filters, onFilterChange]);

  const handleSearch = useCallback((value: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      onFilterChange({ ...filters, search: value });
    }, 300);
  }, [filters, onFilterChange]);

  const handleSaveView = useCallback(() => {
    if (!saveName.trim()) return;
    onSaveView({
      name: saveName.trim(),
      icon: saveIcon,
      filters: { ...filters, search: undefined },
    });
    setSaveName("");
    setSaveIcon("⭐");
    setShowSaveDialog(false);
  }, [saveName, saveIcon, filters, onSaveView]);

  const handleEditView = useCallback((view: SavedView) => {
    if (view.isDefault) return;
    setEditingView(view.name);
    setEditName(view.name);
    setEditIcon(view.icon);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editName.trim() || !editingView) return;
    onDeleteView?.(editingView);
    const view = savedViews.find((v) => v.name === editingView);
    if (view) {
      onSaveView({ ...view, name: editName.trim(), icon: editIcon });
    }
    setEditingView(null);
  }, [editName, editIcon, editingView, savedViews, onDeleteView, onSaveView]);

  // Parse comma-separated filter string to array
  const statusSelected = filters.status && filters.status !== "All" ? filters.status.split(",") : [];
  const prioritySelected = filters.priority && filters.priority !== "All" ? filters.priority.split(",") : [];

  const handleStatusChange = useCallback((selected: string[]) => {
    const value = selected.length === 0 ? "All" : selected.join(",");
    update("status", value);
  }, [update]);

  const handlePriorityChange = useCallback((selected: string[]) => {
    const value = selected.length === 0 ? "All" : selected.join(",");
    update("priority", value);
  }, [update]);

  return (
    <div className="space-y-2">
      {/* Saved views — horizontal scroll */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
        {savedViews.map((view) => (
          <div key={view.name} className="relative group flex-shrink-0">
            {editingView === view.name ? (
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-600 rounded-full px-1 py-0.5">
                <select
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                  className="bg-transparent text-xs w-8 cursor-pointer"
                >
                  {EMOJI_PICKS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setEditingView(null); }}
                  className="bg-transparent text-xs text-slate-100 w-20 focus:outline-none"
                  autoFocus
                />
                <button onClick={handleSaveEdit} className="text-[10px] text-green-400 px-1">OK</button>
              </div>
            ) : (
              <div className="flex items-center">
                <button
                  onClick={() => applyView(view)}
                  onDoubleClick={() => handleEditView(view)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                    activeView === view.name
                      ? "bg-crimson-900/30 border-crimson-700 text-crimson-300"
                      : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span>{view.icon}</span>
                  {view.name}
                  {!view.isDefault && onDeleteView && (
                    <span
                      onClick={(e) => { e.stopPropagation(); onDeleteView(view.name); }}
                      className="hidden group-hover:inline ml-1 text-slate-600 hover:text-red-400 cursor-pointer"
                    >
                      ×
                    </span>
                  )}
                </button>

                {/* Default view context menu trigger */}
                {view.isDefault && onUpdateDefaultView && (
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setViewMenuOpen(viewMenuOpen === view.name ? null : view.name); }}
                      className="hidden group-hover:flex items-center justify-center w-4 h-4 -ml-1 text-[10px] text-slate-600 hover:text-slate-300 transition-colors"
                      title="Customize view"
                    >
                      ⋯
                    </button>
                    {viewMenuOpen === view.name && (
                      <div
                        ref={viewMenuRef}
                        className="absolute z-50 top-full right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[180px]"
                      >
                        <button
                          onClick={() => {
                            onUpdateDefaultView(view.name, { ...filters, search: undefined });
                            setViewMenuOpen(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
                        >
                          Save current filters to this view
                        </button>
                        {hasViewOverride?.(view.name) && onResetDefaultView && (
                          <button
                            onClick={() => {
                              onResetDefaultView(view.name);
                              setViewMenuOpen(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-700 transition-colors"
                          >
                            Reset to default
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <button
          onClick={() => setShowSaveDialog(!showSaveDialog)}
          className="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border border-dashed border-slate-700 text-slate-600 hover:text-slate-400 hover:border-slate-600 transition-all flex-shrink-0"
        >
          + Save View
        </button>
      </div>

      {/* Save dialog with emoji picker */}
      {showSaveDialog && (
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded px-2 py-1">
            {EMOJI_PICKS.slice(0, 8).map((emoji) => (
              <button
                key={emoji}
                onClick={() => setSaveIcon(emoji)}
                className={`text-sm p-0.5 rounded ${saveIcon === emoji ? "bg-slate-700" : "hover:bg-slate-800"}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveView(); if (e.key === "Escape") setShowSaveDialog(false); }}
            placeholder="View name..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-crimson-500"
            autoFocus
          />
          <button onClick={handleSaveView} className="px-3 py-1.5 text-xs bg-crimson-600 text-white rounded font-medium">Save</button>
          <button onClick={() => setShowSaveDialog(false)} className="px-3 py-1.5 text-xs text-slate-500 rounded">Cancel</button>
        </div>
      )}

      {/* Compact filter row */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          defaultValue={filters.search || ""}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search..."
          className="flex-1 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-crimson-500/50"
        />

        {/* Mine / All toggle */}
        <div className="flex items-center gap-0.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => update("owner", "me")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              filters.owner === "me" ? "bg-crimson-600 text-white" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Mine
          </button>
          <button
            onClick={() => update("owner", "")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              !filters.owner ? "bg-crimson-600 text-white" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            All
          </button>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className={`px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
            expanded ? "bg-crimson-900/20 border-crimson-700 text-crimson-400" : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300"
          }`}
        >
          {expanded ? "Less" : "Filters"}
        </button>
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <MultiSelect
              label="Status"
              options={statusOptions}
              selected={statusSelected}
              onChange={handleStatusChange}
            />
            <MultiSelect
              label="Priority"
              options={priorityOptions}
              selected={prioritySelected}
              onChange={handlePriorityChange}
            />
            <FilterSelect label="Due" value={filters.due || "All"} options={DUE_OPTIONS} onChange={(v) => update("due", v)} />
            <FilterSelect label="Hide Done" value={String(filters.hideDoneDays || 0)} options={HIDE_DONE_OPTIONS} onChange={(v) => update("hideDoneDays", parseInt(v, 10) || undefined)} />
            <div className="flex gap-1">
              <div className="flex-1">
                <FilterSelect label="Sort" value={filters.sort || "due_date"} options={SORT_OPTIONS} onChange={(v) => update("sort", v)} />
              </div>
              <button
                onClick={() => update("direction", filters.direction === "asc" ? "desc" : "asc")}
                className="self-end px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-slate-400 hover:text-slate-200"
                title={`Sort ${filters.direction === "asc" ? "ascending" : "descending"}`}
              >
                {filters.direction === "asc" ? "↑" : "↓"}
              </button>
            </div>
          </div>
          {/* Group by */}
          <div className="flex items-center gap-2">
            <FilterSelect
              label="Group By"
              value={filters.groupBy || "none"}
              options={GROUP_BY_OPTIONS}
              onChange={(v) => update("groupBy", v)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-crimson-500 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
