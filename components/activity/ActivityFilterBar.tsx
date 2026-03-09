"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import MultiSelect from "@/components/ui/MultiSelect";

export type GroupBy = "none" | "assignee" | "priority" | "status" | "type";

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
  mode?: string;  // scopes view to a mode. undefined = all modes
}

interface ConfigData {
  statuses?: { id: string; name: string; color?: string; sort_order: number }[];
  priorities?: { id: string; name: string; color?: string; sort_order: number }[];
  members?: { user_id: string; display_name?: string; user?: { id: string; full_name: string; email: string; avatar_url?: string | null } | null }[];
  task_types?: { id: string; name: string; display_color?: string; icon?: string; sort_order: number }[];
  effort_levels?: { id: string; name: string; display_color?: string; icon?: string; sort_order: number }[];
  tags?: { id: string; name: string; display_color?: string; slug?: string }[];
}

interface Props {
  filters: ActivityFilters;
  onFilterChange: (f: ActivityFilters) => void;
  savedViews: SavedView[];
  onSaveView: (view: SavedView, oldName?: string) => void;
  onDeleteView?: (viewName: string) => void;
  config?: ConfigData | null;
  onUpdateViewFilters?: (viewName: string, filters: Partial<ActivityFilters>) => void;
  onResetView?: (viewName: string) => void;
  isViewModifiedFromSeed?: (viewName: string) => boolean;
  seedViewNames?: string[];
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
  { label: "Type", value: "type" },
];

const HIDE_DONE_OPTIONS = [
  { label: "Show All", value: "0" },
  { label: "Hide All", value: "-1" },
  { label: "> 1 day", value: "1" },
  { label: "> 3 days", value: "3" },
  { label: "> 7 days", value: "7" },
  { label: "> 14 days", value: "14" },
  { label: "> 30 days", value: "30" },
];

const EMOJI_PICKS = ["📋", "🔴", "📅", "📆", "🔥", "⭐", "🎯", "🏷️", "👤", "🚀", "💡", "🐛", "📌", "⚡", "🎨", "🔧"];

// Count active non-default filters
function countActiveFilters(filters: ActivityFilters): number {
  let count = 0;
  if (filters.status && filters.status !== "All") count++;
  if (filters.priority && filters.priority !== "All") count++;
  if (filters.due && filters.due !== "All") count++;
  if (filters.owner === "me") count++;
  if (filters.groupBy && filters.groupBy !== "none") count++;
  if (filters.hideDoneDays && filters.hideDoneDays !== 0) count++;
  if (filters.search) count++;
  return count;
}

// Build list of active filter chips for display
function getActiveFilterChips(filters: ActivityFilters): { key: string; label: string; clear: Partial<ActivityFilters> }[] {
  const chips: { key: string; label: string; clear: Partial<ActivityFilters> }[] = [];

  if (filters.status && filters.status !== "All") {
    const statuses = filters.status.split(",");
    chips.push({
      key: "status",
      label: `Status: ${statuses.length > 2 ? `${statuses.length} selected` : statuses.join(", ")}`,
      clear: { status: "All" },
    });
  }
  if (filters.priority && filters.priority !== "All") {
    const priorities = filters.priority.split(",");
    chips.push({
      key: "priority",
      label: `Priority: ${priorities.length > 2 ? `${priorities.length} selected` : priorities.join(", ")}`,
      clear: { priority: "All" },
    });
  }
  if (filters.due && filters.due !== "All") {
    const dueLabel = DUE_OPTIONS.find(o => o.value === filters.due)?.label || filters.due;
    chips.push({ key: "due", label: `Due: ${dueLabel}`, clear: { due: "All" } });
  }
  if (filters.owner === "me") {
    chips.push({ key: "owner", label: "Mine only", clear: { owner: "" } });
  }
  if (filters.groupBy && filters.groupBy !== "none") {
    const groupLabel = GROUP_BY_OPTIONS.find(o => o.value === filters.groupBy)?.label || filters.groupBy;
    chips.push({ key: "groupBy", label: `Group: ${groupLabel}`, clear: { groupBy: "none" } });
  }
  if (filters.hideDoneDays && filters.hideDoneDays !== 0) {
    chips.push({
      key: "hideDone",
      label: filters.hideDoneDays === -1 ? "Hide done" : `Hide done > ${filters.hideDoneDays}d`,
      clear: { hideDoneDays: 0 },
    });
  }
  if (filters.search) {
    chips.push({ key: "search", label: `"${filters.search}"`, clear: { search: "" } });
  }
  return chips;
}

export default function ActivityFilterBar({
  filters,
  onFilterChange,
  savedViews,
  onSaveView,
  onDeleteView,
  config,
  onUpdateViewFilters,
  onResetView,
  isViewModifiedFromSeed,
  seedViewNames,
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
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const activeFilterCount = countActiveFilters(filters);
  const filterChips = getActiveFilterChips(filters);

  const update = useCallback((key: keyof ActivityFilters, value: string | number | undefined) => {
    const next = { ...filters, [key]: value };
    onFilterChange(next);
  }, [filters, onFilterChange]);

  const clearAllFilters = useCallback(() => {
    const defaults: ActivityFilters = { status: "All", priority: "All", due: "All", owner: "", sort: "due_date", direction: "asc", search: "", groupBy: "none", hideDoneDays: 0 };
    onFilterChange(defaults);
    setActiveView("All Tasks");
    if (searchRef.current) searchRef.current.value = "";
  }, [onFilterChange]);

  // Remove a single filter chip
  const removeChip = useCallback((clear: Partial<ActivityFilters>) => {
    const next = { ...filters, ...clear };
    onFilterChange(next);
    // If clearing search, also reset the input
    if ("search" in clear && searchRef.current) {
      searchRef.current.value = "";
    }
  }, [filters, onFilterChange]);

  // Detect if current filters differ from active view's filters
  const activeViewData = activeView ? savedViews.find(v => v.name === activeView) : null;
  const computedFiltersModified = (() => {
    if (!activeViewData) return false;
    const defaults: ActivityFilters = { status: "All", priority: "All", due: "All", owner: "", sort: "due_date", direction: "asc" };
    const normalize = (f: Partial<ActivityFilters>) => {
      const { search, ...rest } = { ...defaults, ...f };
      return JSON.stringify(rest, Object.keys(rest).sort());
    };
    return normalize(filters) !== normalize(activeViewData.filters);
  })();
  const isModified = computedFiltersModified;

  const applyView = useCallback((view: SavedView) => {
    const defaults: ActivityFilters = { status: "All", priority: "All", due: "All", owner: "", sort: "due_date", direction: "asc", search: "" };
    const next: ActivityFilters = { ...defaults, ...view.filters, search: "" };
    setActiveView(view.name);
    onFilterChange(next);
    if (searchRef.current) searchRef.current.value = "";
  }, [onFilterChange]);

  const handleSearch = useCallback((value: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      onFilterChange({ ...filtersRef.current, search: value });
    }, 300);
  }, [onFilterChange]);

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
    setEditingView(view.name);
    setEditName(view.name);
    setEditIcon(view.icon);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editName.trim() || !editingView) return;
    const view = savedViews.find((v) => v.name === editingView);
    if (view) {
      const renamed = editName.trim() !== editingView;
      onSaveView({ ...view, name: editName.trim(), icon: editIcon }, renamed ? editingView : undefined);
      if (renamed && activeView === editingView) {
        setActiveView(editName.trim());
      }
    }
    setEditingView(null);
  }, [editName, editIcon, editingView, savedViews, onSaveView, activeView]);

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

  // Active view for the modification bar
  const activeViewData2 = activeView ? savedViews.find(v => v.name === activeView) : null;
  const isSeedView = !!(activeView && seedViewNames?.includes(activeView));
  const seedModified = !!(activeView && isViewModifiedFromSeed?.(activeView));
  const showModifiedBar = !!(activeViewData2 && onUpdateViewFilters && (isModified || seedModified));

  return (
    <div className="space-y-2">
      {/* Saved views — horizontal scroll */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
        {savedViews.map((view) => (
          <div key={view.name} className="relative group flex-shrink-0">
            {editingView === view.name ? (
              <div className="flex items-center gap-1 bg-dungeon-800 border border-dungeon-600 rounded-full px-1 py-0.5">
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
                className={`relative flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                  activeView === view.name
                    ? "bg-crimson-900/30 border-crimson-700 text-crimson-300"
                    : "bg-dungeon-900 border-dungeon-800 text-slate-500 hover:text-slate-300 hover:border-dungeon-700"
                }`}
              >
                <span>{view.icon}</span>
                {view.name}
                {/* Dot indicator for views modified from seed defaults */}
                {seedViewNames?.includes(view.name) && isViewModifiedFromSeed?.(view.name) && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-crimson-500 rounded-full" />
                )}
                {onDeleteView && (
                  <span
                    onClick={(e) => { e.stopPropagation(); onDeleteView(view.name); if (activeView === view.name) setActiveView(null); }}
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
          className="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border border-dashed border-dungeon-700 text-slate-600 hover:text-slate-400 hover:border-dungeon-600 transition-all flex-shrink-0"
        >
          + Save View
        </button>

      </div>

      {/* View modification bar — shows when active view's filters have been changed */}
      {showModifiedBar && activeViewData2 && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-dungeon-900/60 border border-dungeon-800 rounded-lg text-xs">
          {isModified ? (
            <>
              <span className="text-slate-400">
                <span className="font-medium text-slate-300">{activeViewData2.name}</span> filters modified
              </span>
              <button
                onClick={() => onUpdateViewFilters!(activeViewData2.name, { ...filters, search: undefined })}
                className="text-green-400 hover:text-green-300 font-medium transition-colors"
              >
                Save to view
              </button>
              <span className="text-slate-700">|</span>
              <button
                onClick={() => applyView(activeViewData2)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                Discard
              </button>
              {isSeedView && seedModified && onResetView && (
                <>
                  <span className="text-slate-700">|</span>
                  <button
                    onClick={() => onResetView(activeViewData2.name)}
                    className="text-amber-500 hover:text-amber-300 transition-colors"
                  >
                    Reset to default
                  </button>
                </>
              )}
            </>
          ) : seedModified ? (
            <>
              <span className="text-slate-400">
                <span className="font-medium text-slate-300">{activeViewData2.name}</span> customized from default
              </span>
              <button
                onClick={() => setExpanded(true)}
                className="text-crimson-400 hover:text-crimson-300 font-medium transition-colors"
              >
                Edit
              </button>
              {onResetView && (
                <>
                  <span className="text-slate-700">|</span>
                  <button
                    onClick={() => onResetView(activeViewData2.name)}
                    className="text-amber-500 hover:text-amber-300 transition-colors"
                  >
                    Reset to default
                  </button>
                </>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Save dialog with emoji picker */}
      {showSaveDialog && (
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-1 bg-dungeon-900 border border-dungeon-700 rounded px-2 py-1">
            {EMOJI_PICKS.slice(0, 8).map((emoji) => (
              <button
                key={emoji}
                onClick={() => setSaveIcon(emoji)}
                className={`text-sm p-0.5 rounded ${saveIcon === emoji ? "bg-dungeon-700" : "hover:bg-dungeon-800"}`}
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
            className="flex-1 bg-dungeon-900 border border-dungeon-700 rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-crimson-500"
            autoFocus
          />
          <button onClick={handleSaveView} className="px-3 py-1.5 text-xs bg-crimson-600 text-white rounded font-medium">Save</button>
          <button onClick={() => setShowSaveDialog(false)} className="px-3 py-1.5 text-xs text-slate-500 rounded">Cancel</button>
        </div>
      )}

      {/* Compact filter row — Mine/All + Filters (with count badge) + search */}
      <div className="flex items-center gap-2">
        {/* Mine / All toggle */}
        <div className="flex items-center gap-0.5 bg-dungeon-900 border border-dungeon-800 rounded-lg p-0.5 flex-shrink-0">
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
          className={`relative px-2.5 py-1.5 rounded-lg text-xs border transition-all flex-shrink-0 ${
            expanded || activeFilterCount > 0
              ? "bg-crimson-900/20 border-crimson-700 text-crimson-400"
              : "bg-dungeon-900 border-dungeon-800 text-slate-500 hover:text-slate-300"
          }`}
        >
          {expanded ? "Less" : "Filters"}
          {activeFilterCount > 0 && !expanded && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center bg-crimson-600 text-white text-[10px] font-bold rounded-full px-1">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Clear all — only show when filters are active */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
          >
            Clear all
          </button>
        )}

        <input
          type="text"
          ref={searchRef}
          defaultValue={filters.search || ""}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search..."
          className="flex-1 min-w-0 bg-dungeon-900/80 border border-dungeon-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-crimson-500/50"
        />
      </div>

      {/* Active filter chips — removable pills showing what's filtered */}
      {filterChips.length > 0 && !expanded && (
        <div className="flex flex-wrap gap-1.5">
          {filterChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-crimson-900/20 border border-crimson-800/50 text-crimson-300"
            >
              {chip.label}
              <button
                onClick={() => removeChip(chip.clear)}
                className="ml-0.5 text-crimson-500 hover:text-crimson-300 transition-colors leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

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
                className="self-end px-2.5 py-1.5 bg-dungeon-900 border border-dungeon-800 rounded text-xs text-slate-400 hover:text-slate-200"
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
        className="w-full px-2 py-1.5 bg-dungeon-900 border border-dungeon-800 rounded text-xs text-slate-200 focus:outline-none focus:border-crimson-500 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
