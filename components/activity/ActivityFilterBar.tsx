"use client";

import React, { useState, useCallback, useRef } from "react";

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
}

export interface SavedView {
  name: string;
  icon: string;
  filters: Partial<ActivityFilters>;
  isDefault?: boolean;
}

interface ConfigData {
  statuses?: { id: string; name: string; sort_order: number }[];
  priorities?: { id: string; name: string; sort_order: number }[];
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
}

const FALLBACK_STATUS_OPTIONS = [
  { label: "All", value: "All" },
  { label: "To Do", value: "To Do" },
  { label: "In Progress", value: "In Progress" },
  { label: "Blocked", value: "Blocked" },
  { label: "Done", value: "Done" },
  { label: "Someday", value: "Someday" },
];

const FALLBACK_PRIORITY_OPTIONS = [
  { label: "All", value: "All" },
  { label: "Urgent", value: "Urgent" },
  { label: "High", value: "High" },
  { label: "Medium", value: "Medium" },
  { label: "Low", value: "Low" },
];

function buildStatusOptions(config?: ConfigData | null) {
  if (!config?.statuses?.length) return FALLBACK_STATUS_OPTIONS;
  return [
    { label: "All", value: "All" },
    ...[...config.statuses]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ label: s.name, value: s.name })),
  ];
}

function buildPriorityOptions(config?: ConfigData | null) {
  if (!config?.priorities?.length) return FALLBACK_PRIORITY_OPTIONS;
  return [
    { label: "All", value: "All" },
    ...[...config.priorities]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({ label: p.name, value: p.name })),
  ];
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

const EMOJI_PICKS = ["📋", "🔴", "📅", "📆", "🔥", "⭐", "🎯", "🏷️", "👤", "🚀", "💡", "🐛", "📌", "⚡", "🎨", "🔧"];

export default function ActivityFilterBar({ filters, onFilterChange, savedViews, onSaveView, onDeleteView, config }: Props) {
  const statusOptions = buildStatusOptions(config);
  const priorityOptions = buildPriorityOptions(config);
  const [activeView, setActiveView] = useState<string | null>("All Tasks");
  const [expanded, setExpanded] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveIcon, setSaveIcon] = useState("⭐");
  const [editingView, setEditingView] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const update = useCallback((key: keyof ActivityFilters, value: string) => {
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
    // Delete old view and save renamed one
    onDeleteView?.(editingView);
    const view = savedViews.find((v) => v.name === editingView);
    if (view) {
      onSaveView({ ...view, name: editName.trim(), icon: editIcon });
    }
    setEditingView(null);
  }, [editName, editIcon, editingView, savedViews, onDeleteView, onSaveView]);

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <FilterSelect label="Status" value={filters.status || "All"} options={statusOptions} onChange={(v) => update("status", v)} />
            <FilterSelect label="Priority" value={filters.priority || "All"} options={priorityOptions} onChange={(v) => update("priority", v)} />
            <FilterSelect label="Due" value={filters.due || "All"} options={DUE_OPTIONS} onChange={(v) => update("due", v)} />
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
