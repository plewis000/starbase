"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
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
  mode?: string;  // scopes view to a mode. undefined = all modes
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
  activeViewName?: string | null;
  filtersModified?: boolean;
  hiddenDefaults?: string[];
  onHideDefault?: (name: string) => void;
  onRestoreDefault?: (name: string) => void;
  allDefaultViews?: SavedView[];
  archivedViews?: SavedView[];
  onRestoreArchivedView?: (name: string) => void;
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
  { label: "Hide All", value: "-1" },
  { label: "> 1 day", value: "1" },
  { label: "> 3 days", value: "3" },
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
  activeViewName,
  filtersModified,
  hiddenDefaults,
  onHideDefault,
  onRestoreDefault,
  allDefaultViews,
  archivedViews,
  onRestoreArchivedView,
}: Props) {
  const statusOptions = buildStatusMultiOptions(config);
  const priorityOptions = buildPriorityMultiOptions(config);
  const [activeView, setActiveView] = useState<string | null>(activeViewName ?? "All Tasks");
  const [expanded, setExpanded] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveIcon, setSaveIcon] = useState("⭐");
  const [editingView, setEditingView] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [showRestoreMenu, setShowRestoreMenu] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Hidden defaults + archived custom views for restore menu
  const hiddenDefaultViews = (allDefaultViews || []).filter(v => hiddenDefaults?.includes(v.name));
  const totalRestorableCount = hiddenDefaultViews.length + (archivedViews?.length || 0);

  const update = useCallback((key: keyof ActivityFilters, value: string | number | undefined) => {
    const next = { ...filters, [key]: value };
    onFilterChange(next);
  }, [filters, onFilterChange]);

  // Detect if current filters differ from active view's filters
  const activeViewData = activeView ? savedViews.find(v => v.name === activeView) : null;
  const computedFiltersModified = (() => {
    if (!activeViewData) return false;
    const defaults: ActivityFilters = { status: "All", priority: "All", due: "All", owner: "", sort: "due_date", direction: "asc" };
    // Normalize both to the same shape: defaults + view overrides vs current (both without search)
    const normalize = (f: Partial<ActivityFilters>) => {
      const { search, ...rest } = { ...defaults, ...f };
      return JSON.stringify(rest, Object.keys(rest).sort());
    };
    return normalize(filters) !== normalize(activeViewData.filters);
  })();
  const isModified = filtersModified ?? computedFiltersModified;

  const applyView = useCallback((view: SavedView) => {
    // Start from clean defaults, then apply view filters — don't carry over stale filter state
    const defaults: ActivityFilters = { status: "All", priority: "All", due: "All", owner: "", sort: "due_date", direction: "asc", search: "" };
    const next: ActivityFilters = { ...defaults, ...view.filters, search: "" };
    setActiveView(view.name);
    onFilterChange(next);
  }, [onFilterChange]);

  const handleSearch = useCallback((value: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      // Use functional-style update via onFilterChange to avoid stale filters capture
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
    if (view.isDefault) return;
    setEditingView(view.name);
    setEditName(view.name);
    setEditIcon(view.icon);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editName.trim() || !editingView) return;
    const view = savedViews.find((v) => v.name === editingView);
    if (view) {
      // Archive old name, then save with new name — onDeleteView archives, onSaveView adds
      // Do save first so the view exists before archive removes the old one
      onSaveView({ ...view, name: editName.trim(), icon: editIcon });
      if (editName.trim() !== editingView) {
        onDeleteView?.(editingView);
      }
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

  // Active default view for the modification bar
  const activeDefaultView = activeView ? savedViews.find(v => v.name === activeView && v.isDefault) : null;
  const hasOverride = !!(activeDefaultView && hasViewOverride?.(activeDefaultView.name));
  // Show bar when: filters are modified (unsaved changes) OR view has a saved override (show Edit/Reset)
  const showModifiedBar = !!(activeDefaultView && onUpdateDefaultView && (isModified || hasOverride));

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
                {/* Dot indicator for customized default views */}
                {view.isDefault && hasViewOverride?.(view.name) && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-crimson-500 rounded-full" />
                )}
                {view.isDefault && onHideDefault && (
                  <span
                    onClick={(e) => { e.stopPropagation(); onHideDefault(view.name); if (activeView === view.name) setActiveView(null); }}
                    className="hidden group-hover:inline ml-1 text-slate-600 hover:text-red-400 cursor-pointer"
                  >
                    ×
                  </span>
                )}
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
          className="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border border-dashed border-dungeon-700 text-slate-600 hover:text-slate-400 hover:border-dungeon-600 transition-all flex-shrink-0"
        >
          + Save View
        </button>

        {totalRestorableCount > 0 && (
          <button
            onClick={() => setShowRestoreMenu(true)}
            className="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border border-dashed border-dungeon-700 text-slate-600 hover:text-slate-400 hover:border-dungeon-600 transition-all flex-shrink-0"
          >
            + Restore ({totalRestorableCount})
          </button>
        )}
      </div>

      {/* View override notification bar */}
      {showModifiedBar && activeDefaultView && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-dungeon-900/60 border border-dungeon-800 rounded-lg text-xs">
          {isModified ? (
            <>
              <span className="text-slate-400">
                <span className="font-medium text-slate-300">{activeDefaultView.name}</span> filters modified
              </span>
              <button
                onClick={() => onUpdateDefaultView!(activeDefaultView.name, { ...filters, search: undefined })}
                className="text-green-400 hover:text-green-300 font-medium transition-colors"
              >
                Save
              </button>
              {hasOverride && onResetDefaultView && (
                <>
                  <span className="text-slate-700">|</span>
                  <button
                    onClick={() => onResetDefaultView(activeDefaultView.name)}
                    className="text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Reset
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <span className="text-slate-400">
                <span className="font-medium text-slate-300">{activeDefaultView.name}</span> customized
              </span>
              <button
                onClick={() => setExpanded(true)}
                className="text-crimson-400 hover:text-crimson-300 font-medium transition-colors"
              >
                Edit
              </button>
              {onResetDefaultView && (
                <>
                  <span className="text-slate-700">|</span>
                  <button
                    onClick={() => onResetDefaultView(activeDefaultView.name)}
                    className="text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Reset
                  </button>
                </>
              )}
            </>
          )}
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

      {/* Compact filter row — Mine/All + Filters left, search right */}
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
          className={`px-2.5 py-1.5 rounded-lg text-xs border transition-all flex-shrink-0 ${
            expanded ? "bg-crimson-900/20 border-crimson-700 text-crimson-400" : "bg-dungeon-900 border-dungeon-800 text-slate-500 hover:text-slate-300"
          }`}
        >
          {expanded ? "Less" : "Filters"}
        </button>

        <input
          type="text"
          defaultValue={filters.search || ""}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search..."
          className="flex-1 min-w-0 bg-dungeon-900/80 border border-dungeon-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-crimson-500/50"
        />
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

      {/* Restore / Archive dialog */}
      {showRestoreMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowRestoreMenu(false)}>
          <div className="bg-dungeon-900 border border-dungeon-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-dungeon-800">
              <h3 className="text-sm font-semibold text-slate-200">Restore Views</h3>
              <button onClick={() => setShowRestoreMenu(false)} className="text-slate-500 hover:text-slate-300 text-lg leading-none">&times;</button>
            </div>
            <div className="p-2 max-h-64 overflow-y-auto">
              {hiddenDefaultViews.length > 0 && (
                <div className="mb-2">
                  <p className="px-2 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Hidden Defaults</p>
                  {hiddenDefaultViews.map((view) => (
                    <div key={view.name} className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-dungeon-800 transition-colors">
                      <span className="flex items-center gap-2 text-xs text-slate-300">
                        <span>{view.icon}</span>
                        {view.name}
                      </span>
                      <button
                        onClick={() => { onRestoreDefault?.(view.name); }}
                        className="px-2.5 py-1 text-[11px] font-medium text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 rounded transition-colors"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {(archivedViews?.length || 0) > 0 && (
                <div>
                  <p className="px-2 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Archived Custom Views</p>
                  {archivedViews?.map((view) => (
                    <div key={view.name} className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-dungeon-800 transition-colors">
                      <span className="flex items-center gap-2 text-xs text-slate-300">
                        <span>{view.icon}</span>
                        {view.name}
                      </span>
                      <button
                        onClick={() => { onRestoreArchivedView?.(view.name); }}
                        className="px-2.5 py-1 text-[11px] font-medium text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 rounded transition-colors"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {totalRestorableCount === 0 && (
                <p className="px-2 py-4 text-xs text-slate-500 text-center">No views to restore.</p>
              )}
            </div>
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
