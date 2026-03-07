"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import { useUserPreference } from "@/hooks/useUserPreferences";

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
}

interface IntegrationStatus {
  discord: { connected: boolean; guild_id?: string };
  plaid: { connected: boolean; accounts?: number };
  anthropic: { connected: boolean; model?: string };
}

interface ConfigItem {
  id: string;
  name: string;
  slug?: string;
  display_color?: string;
  icon?: string;
  sort_order?: number;
  active?: boolean;
}

interface HouseholdData {
  id: string;
  name: string;
  timezone: string;
  locale?: string;
  members: { id: string; user_id: string; role: string; display_name?: string; joined_at: string }[];
}

interface SavedView {
  name: string;
  icon?: string;
  isDefault?: boolean;
  filters: Record<string, string>;
}

const CONFIG_SECTIONS = [
  { group: "Tasks", items: [
    { table: "task_statuses", label: "Statuses" },
    { table: "task_priorities", label: "Priorities" },
    { table: "task_types", label: "Types" },
    { table: "effort_levels", label: "Effort Levels" },
    { table: "tags", label: "Tags" },
  ]},
  { group: "Goals", items: [
    { table: "goal_categories", label: "Categories" },
    { table: "goal_timeframes", label: "Timeframes" },
  ]},
  { group: "Habits", items: [
    { table: "habit_frequencies", label: "Frequencies" },
    { table: "habit_time_preferences", label: "Time Preferences" },
  ]},
  { group: "Other", items: [
    { table: "shopping_categories", label: "Shopping Categories" },
    { table: "expense_categories", label: "Expense Categories" },
    { table: "location_contexts", label: "Location Contexts" },
  ]},
];

const TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "UTC",
];

type TabId = "profile" | "integrations" | "notifications" | "customization" | "household" | "saved_views" | "zev_memory";

export default function SettingsPage() {
  const toast = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/user");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setIntegrations(data.integrations);
        }
      } catch { toast.error("Failed to load profile"); }
      setLoading(false);
    };
    load();
  }, []);

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "profile", label: "Profile", icon: "👤" },
    { id: "household", label: "Household", icon: "🏠" },
    { id: "integrations", label: "Integrations", icon: "🔌" },
    { id: "notifications", label: "Notifications", icon: "🔔" },
    { id: "customization", label: "Customization", icon: "🎨" },
    { id: "saved_views", label: "Saved Views", icon: "📋" },
    { id: "zev_memory", label: "Zev's Memory", icon: "🧠" },
  ];

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-dungeon-800 rounded w-48" />
          <div className="h-64 bg-dungeon-800 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-100 dcc-heading tracking-wide">Registry</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 dcc-card p-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-dungeon-800 text-crimson-400"
                : "text-dungeon-500 hover:text-slate-100"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && user && (
        <div className="dcc-card p-6 space-y-6">
          <div className="flex items-center gap-4">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.full_name} className="w-16 h-16 rounded-full" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-dungeon-700 flex items-center justify-center text-xl font-bold text-slate-300">
                {user.full_name?.charAt(0) || "?"}
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{user.full_name}</h2>
              <p className="text-sm text-slate-400">{user.email}</p>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">User ID</label>
              <p className="text-sm text-slate-300 font-mono bg-dungeon-800 px-3 py-2 rounded">{user.id}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Auth Provider</label>
              <p className="text-sm text-slate-300">Google OAuth</p>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Profile details are managed through your Google account.
          </p>
        </div>
      )}

      {/* Household Tab */}
      {activeTab === "household" && <HouseholdTab />}

      {/* Integrations Tab */}
      {activeTab === "integrations" && (
        <div className="space-y-4">
          <div className="dcc-card p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center text-lg">💬</div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Discord (Zev)</h3>
                <p className="text-xs text-slate-400">AI assistant in your Discord server</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              integrations?.discord?.connected ? "bg-green-500/20 text-green-400" : "bg-dungeon-700 text-slate-400"
            }`}>
              {integrations?.discord?.connected ? "Connected" : "Not connected"}
            </span>
          </div>

          <div className="dcc-card p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center text-lg">🏦</div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Plaid</h3>
                <p className="text-xs text-slate-400">Bank account sync & transaction import</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              integrations?.plaid?.connected ? "bg-green-500/20 text-green-400" : "bg-dungeon-700 text-slate-400"
            }`}>
              {integrations?.plaid?.connected
                ? `${integrations.plaid.accounts} account${integrations.plaid.accounts !== 1 ? "s" : ""}`
                : "Not connected"}
            </span>
          </div>

          <div className="dcc-card p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center text-lg font-bold text-amber-400">Z</div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Claude API (Zev&apos;s Brain)</h3>
                <p className="text-xs text-slate-400">Powers AI responses and tool execution</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              integrations?.anthropic?.connected ? "bg-green-500/20 text-green-400" : "bg-dungeon-700 text-slate-400"
            }`}>
              {integrations?.anthropic?.connected ? "Active" : "Not configured"}
            </span>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === "notifications" && <NotificationPreferences />}

      {/* Customization Tab */}
      {activeTab === "customization" && (
        <div className="space-y-8">
          {CONFIG_SECTIONS.map((group) => (
            <div key={group.group}>
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">{group.group}</h2>
              <div className="space-y-4">
                {group.items.map((section) => (
                  <ConfigSection key={section.table} table={section.table} label={section.label} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Saved Views Tab */}
      {activeTab === "saved_views" && <SavedViewsManager />}

      {/* Zev's Memory Tab */}
      {activeTab === "zev_memory" && <ZevMemoryManager />}

      {/* Keyboard shortcuts */}
      <div className="dcc-card p-6">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">Keyboard Shortcuts</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Command palette</span>
            <kbd className="px-2 py-0.5 bg-dungeon-800 text-slate-300 rounded border border-dungeon-700 text-xs">Cmd+K</kbd>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Close modal</span>
            <kbd className="px-2 py-0.5 bg-dungeon-800 text-slate-300 rounded border border-dungeon-700 text-xs">Esc</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}

function HouseholdTab() {
  const toast = useToast();
  const [household, setHousehold] = useState<HouseholdData | null>(null);
  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingTz, setSavingTz] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/household");
        if (res.ok) {
          const data = await res.json();
          setHousehold(data.household);
          setRole(data.current_role || "");
          setNameValue(data.household?.name || "");
        }
      } catch { toast.error("Failed to load household"); }
      setLoading(false);
    };
    load();
  }, []);

  const handleUpdateName = async () => {
    if (!nameValue.trim() || !household) return;
    try {
      const res = await fetch("/api/household", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameValue.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setHousehold((prev) => prev ? { ...prev, name: data.household.name } : prev);
        toast.success("Household name updated");
      } else {
        toast.error("Failed to update name");
      }
    } catch { toast.error("Failed to update name"); }
    setEditingName(false);
  };

  const handleTimezoneChange = async (tz: string) => {
    if (!household) return;
    setSavingTz(true);
    try {
      const res = await fetch("/api/household", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz }),
      });
      if (res.ok) {
        const data = await res.json();
        setHousehold((prev) => prev ? { ...prev, timezone: data.household.timezone } : prev);
        toast.success(`Timezone set to ${tz}`);
      } else {
        toast.error("Failed to update timezone");
      }
    } catch { toast.error("Failed to update timezone"); }
    setSavingTz(false);
  };

  if (loading) {
    return <div className="dcc-card p-4"><div className="animate-pulse h-32 bg-dungeon-800 rounded" /></div>;
  }

  if (!household) {
    return (
      <div className="dcc-card p-6 text-center">
        <p className="text-slate-400 text-sm">No household found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="dcc-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-400">Household Name</label>
          {role === "admin" && !editingName && (
            <button onClick={() => setEditingName(true)} className="text-xs text-slate-500 hover:text-slate-300">Edit</button>
          )}
        </div>
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleUpdateName(); if (e.key === "Escape") setEditingName(false); }}
              className="flex-1 bg-dungeon-800 border border-red-400 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none"
              autoFocus
            />
            <button onClick={handleUpdateName} className="text-xs text-green-400 hover:text-green-300">Save</button>
            <button onClick={() => setEditingName(false)} className="text-xs text-slate-500">Cancel</button>
          </div>
        ) : (
          <p className="text-lg font-semibold text-slate-100">{household.name}</p>
        )}
      </div>

      <div className="dcc-card p-5 space-y-3">
        <label className="block text-sm font-medium text-slate-400">Timezone</label>
        <select
          value={household.timezone || "America/Chicago"}
          onChange={(e) => handleTimezoneChange(e.target.value)}
          disabled={role !== "admin" || savingTz}
          className="w-full bg-dungeon-800 border border-dungeon-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-400 disabled:opacity-50"
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
          ))}
        </select>
        {savingTz && <span className="text-xs text-slate-500">Saving...</span>}
      </div>

      <div className="dcc-card p-5 space-y-3">
        <h3 className="text-sm font-medium text-slate-400">Members</h3>
        <div className="space-y-2">
          {household.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-dungeon-800/50 rounded-lg">
              <div>
                <span className="text-sm text-slate-200">{m.display_name || m.user_id}</span>
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${
                m.role === "admin" ? "bg-red-900/30 text-red-400" : "bg-dungeon-700 text-slate-400"
              }`}>
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SavedViewsManager() {
  const { value: savedViews, setValue: setSavedViews } = useUserPreference<SavedView[]>("activity_saved_views", []);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const handleRename = (idx: number) => {
    if (!editName.trim()) return;
    const next = [...savedViews];
    next[idx] = { ...next[idx], name: editName.trim() };
    setSavedViews(next);
    setEditingIdx(null);
  };

  const handleArchive = (idx: number) => {
    const next = [...savedViews];
    next[idx] = { ...next[idx], archived: true } as SavedView & { archived?: boolean };
    setSavedViews(next);
  };

  const handleRestore = (idx: number) => {
    const next = [...savedViews];
    const { archived, ...rest } = next[idx] as SavedView & { archived?: boolean };
    next[idx] = rest as SavedView;
    setSavedViews(next);
  };

  const visibleViews = savedViews.map((v, i) => ({ view: v, idx: i })).filter(({ view }) => {
    const isArchived = (view as SavedView & { archived?: boolean }).archived;
    return showArchived ? isArchived : !isArchived;
  });

  return (
    <div className="dcc-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">Saved Filter Views</h3>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-dungeon-600 w-3.5 h-3.5"
          />
          <span className="text-[10px] text-slate-500">Show archived</span>
        </label>
      </div>
      {visibleViews.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">
          {showArchived ? "No archived views." : "No saved views yet. Save a filter from the Task Board."}
        </p>
      ) : (
        <div className="space-y-2">
          {visibleViews.map(({ view, idx }) => {
            const isArchived = (view as SavedView & { archived?: boolean }).archived;
            return (
            <div key={idx} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isArchived ? "opacity-50" : "hover:bg-dungeon-800/50"}`}>
              <span className="text-sm">{view.icon || "📋"}</span>
              {editingIdx === idx ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(idx); if (e.key === "Escape") setEditingIdx(null); }}
                    className="flex-1 bg-dungeon-800 border border-red-400 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none"
                    autoFocus
                  />
                  <button onClick={() => handleRename(idx)} className="text-xs text-green-400">Save</button>
                  <button onClick={() => setEditingIdx(null)} className="text-xs text-slate-500">Cancel</button>
                </div>
              ) : (
                <>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm text-slate-200">{view.name}</span>
                    {isArchived && (
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-dungeon-700 text-slate-400 rounded">
                        Archived
                      </span>
                    )}
                  </div>
                  {!isArchived && (
                    <button
                      onClick={() => { setEditingIdx(idx); setEditName(view.name); }}
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      Rename
                    </button>
                  )}
                  {isArchived ? (
                    <button
                      onClick={() => handleRestore(idx)}
                      className="text-xs text-green-500 hover:text-green-400"
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      onClick={() => handleArchive(idx)}
                      className="text-xs text-slate-500 hover:text-amber-400"
                    >
                      Archive
                    </button>
                  )}
                </>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfigSection({ table, label }: { table: string; label: string }) {
  const toast = useToast();
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("");

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/config?table=${table}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || data || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [table]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, name: newName.trim(), display_color: newColor || undefined }),
      });
      if (res.ok) {
        toast.success(`Added "${newName.trim()}"`);
        setNewName("");
        setNewColor("");
        setShowAdd(false);
        fetchItems();
      } else {
        toast.error("Failed to add item");
      }
    } catch { toast.error("Failed to add item"); }
  };

  const handleUpdate = async (id: string) => {
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table,
          id,
          name: editName.trim() || undefined,
          display_color: editColor || undefined,
          icon: editIcon || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Updated");
        setEditingId(null);
        fetchItems();
      } else {
        toast.error("Failed to update");
      }
    } catch { toast.error("Failed to update"); }
  };

  const handleToggleActive = async (item: ConfigItem) => {
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, id: item.id, active: !item.active }),
      });
      if (res.ok) fetchItems();
    } catch { toast.error("Failed to update"); }
  };

  if (loading) {
    return (
      <div className="dcc-card p-4">
        <div className="animate-pulse h-20 bg-dungeon-800 rounded" />
      </div>
    );
  }

  return (
    <div className="dcc-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">{label}</h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-dungeon-600 w-3.5 h-3.5"
            />
            <span className="text-[10px] text-slate-500">Show inactive</span>
          </label>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-3 py-1 text-xs font-medium text-red-400 border border-red-400/30 rounded-lg hover:bg-red-400/10 transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="flex items-center gap-2 p-3 bg-dungeon-800/50 rounded-lg">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAdd(false); }}
            placeholder="Name..."
            className="flex-1 bg-dungeon-800 border border-dungeon-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400"
            autoFocus
          />
          <input
            type="color"
            value={newColor || "#64748b"}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-10 h-10 rounded border border-dungeon-700 bg-transparent cursor-pointer"
            title="Color"
          />
          <button onClick={handleAdd} className="px-3 py-2 bg-red-400 hover:bg-red-500 text-slate-950 text-sm font-medium rounded transition-colors">
            Add
          </button>
          <button onClick={() => setShowAdd(false)} className="px-3 py-2 text-slate-400 text-sm">
            Cancel
          </button>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-1">
        {items.filter((item) => showInactive || item.active !== false).map((item, idx) => {
          const isInactive = item.active === false;
          return (
          <div
            key={item.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              isInactive ? "opacity-50" : "hover:bg-dungeon-800/50"
            }`}
          >
            {/* Sort order indicator */}
            <span className="text-[10px] text-slate-600 font-mono w-4">{idx + 1}</span>

            {/* Color swatch */}
            <div
              className="w-4 h-4 rounded-full flex-shrink-0 border border-dungeon-600"
              style={{ backgroundColor: item.display_color || "#64748b" }}
            />

            {/* Name / editing */}
            {editingId === item.id ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(item.id); if (e.key === "Escape") setEditingId(null); }}
                  className="flex-1 bg-dungeon-800 border border-red-400 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none"
                  autoFocus
                />
                <input
                  type="text"
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                  placeholder="Icon"
                  className="w-12 bg-dungeon-800 border border-dungeon-700 rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-red-400"
                />
                <input
                  type="color"
                  value={editColor || item.display_color || "#64748b"}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-8 h-8 rounded border border-dungeon-700 bg-transparent cursor-pointer"
                />
                <button onClick={() => handleUpdate(item.id)} className="text-xs text-green-400 hover:text-green-300">Save</button>
                <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
              </div>
            ) : (
              <>
                <div className="flex-1 flex items-center gap-2">
                  {item.icon && <span className="text-sm">{item.icon}</span>}
                  <span className={`text-sm ${isInactive ? "line-through text-slate-500" : "text-slate-200"}`}>{item.name}</span>
                  {item.slug && <span className="text-[10px] text-slate-600 font-mono">{item.slug}</span>}
                  {isInactive && (
                    <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-dungeon-700 text-slate-400 rounded">
                      Inactive
                    </span>
                  )}
                </div>

                {/* Actions */}
                <button
                  onClick={() => {
                    setEditingId(item.id);
                    setEditName(item.name);
                    setEditColor(item.display_color || "");
                    setEditIcon(item.icon || "");
                  }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleToggleActive(item)}
                  className={`text-xs transition-colors ${
                    item.active === false
                      ? "text-green-500 hover:text-green-400"
                      : "text-slate-500 hover:text-red-400"
                  }`}
                >
                  {item.active === false ? "Enable" : "Disable"}
                </button>
              </>
            )}
          </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-4">No items configured</p>
      )}
    </div>
  );
}

// ─── Notification Preferences ──────────────────────────────

interface NotifPref {
  channel_id: string;
  channel_name: string;
  channel_slug: string;
  channel_icon: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
  pref_id: string | null;
}

function NotificationPreferences() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<NotifPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const fetchPrefs = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/preferences");
      if (res.ok) {
        const data = await res.json();
        setPrefs(data.preferences || []);
        const discord = (data.preferences || []).find((p: NotifPref) => p.channel_slug === "discord");
        if (discord?.config?.webhook_url) {
          setWebhookUrl(discord.config.webhook_url as string);
        }
      }
    } catch {
      toast.error("Failed to load notification preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrefs(); }, [fetchPrefs]);

  const toggleChannel = async (pref: NotifPref) => {
    setSaving(pref.channel_id);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: pref.channel_id,
          enabled: !pref.enabled,
        }),
      });
      if (res.ok) {
        toast.success(`${pref.channel_name} ${pref.enabled ? "disabled" : "enabled"}`);
        fetchPrefs();
      }
    } finally {
      setSaving(null);
    }
  };

  const saveWebhook = async () => {
    const discord = prefs.find((p) => p.channel_slug === "discord");
    if (!discord) return;
    setSaving(discord.channel_id);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: discord.channel_id,
          enabled: true,
          config: { webhook_url: webhookUrl.trim() },
        }),
      });
      if (res.ok) {
        toast.success("Discord webhook saved");
        fetchPrefs();
      } else {
        toast.error("Failed to save webhook");
      }
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="dcc-card p-6"><p className="text-sm text-slate-400">Loading preferences...</p></div>;
  }

  return (
    <div className="space-y-4">
      {prefs.map((pref) => (
        <div key={pref.channel_id} className="dcc-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">{pref.channel_icon}</span>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">{pref.channel_name}</h3>
                <p className="text-xs text-slate-500">{pref.channel_slug}</p>
              </div>
            </div>
            <button
              onClick={() => toggleChannel(pref)}
              disabled={saving === pref.channel_id}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                pref.enabled
                  ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                  : "bg-dungeon-700 text-slate-400 hover:bg-dungeon-600"
              }`}
            >
              {pref.enabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          {/* Discord-specific: webhook URL */}
          {pref.channel_slug === "discord" && (
            <div className="mt-3 pt-3 border-t border-dungeon-700">
              <label className="text-xs text-slate-400 block mb-1">
                Discord Webhook URL (for task reminders)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="flex-1 bg-dungeon-800 border border-dungeon-600 rounded px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
                />
                <button
                  onClick={saveWebhook}
                  disabled={saving === pref.channel_id || !webhookUrl.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs font-medium"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Create a webhook in your Discord server settings and paste the URL here to receive daily task reminders.
              </p>
            </div>
          )}
        </div>
      ))}

      {prefs.length === 0 && (
        <div className="dcc-card p-6 text-center">
          <p className="text-sm text-slate-400">No notification channels configured.</p>
        </div>
      )}
    </div>
  );
}

// ─── Zev's Memory Manager ──────────────────────────────

interface Observation {
  id: string;
  observation_type: string;
  observation: string;
  confidence: number;
  source_layer: string;
  tags: string[] | null;
  created_at: string;
  is_active: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  preference: "Preferences",
  routine: "Routines & Schedule",
  personality: "Personality",
  relationship: "Relationships",
  goal: "Goals",
  boundary: "Boundaries",
  context: "Life Context",
  feedback_pattern: "How You Respond",
  correction: "Corrections",
};

const TYPE_ICONS: Record<string, string> = {
  preference: "⭐",
  routine: "🔄",
  personality: "🎭",
  relationship: "👥",
  goal: "🎯",
  boundary: "🚫",
  context: "📍",
  feedback_pattern: "💬",
  correction: "⚠️",
};

function ZevMemoryManager() {
  const toast = useToast();
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchObservations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("type", filterType);
      if (showInactive) params.set("active", "false");
      params.set("limit", "100");

      const res = await fetch(`/api/ai/observations?${params}`);
      if (res.ok) {
        const data = await res.json();
        setObservations(data.observations || []);
        setTotal(data.total || 0);
      }
    } catch {
      toast.error("Failed to load observations");
    } finally {
      setLoading(false);
    }
  }, [filterType, showInactive]);

  useEffect(() => { fetchObservations(); }, [fetchObservations]);

  const handleUpdate = async (id: string) => {
    if (!editContent.trim()) return;
    try {
      const res = await fetch("/api/ai/observations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content: editContent.trim() }), // API accepts "content" and maps to "observation"
      });
      if (res.ok) {
        toast.success("Observation updated");
        setEditingId(null);
        fetchObservations();
      } else {
        toast.error("Failed to update");
      }
    } catch { toast.error("Failed to update"); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/observations?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Observation removed");
        fetchObservations();
      } else {
        toast.error("Failed to remove");
      }
    } catch { toast.error("Failed to remove"); }
  };

  // Group observations by type
  const grouped: Record<string, Observation[]> = {};
  for (const obs of observations) {
    const type = obs.observation_type;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(obs);
  }

  if (loading) {
    return <div className="dcc-card p-6"><div className="animate-pulse h-32 bg-dungeon-800 rounded" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="dcc-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">What Zev Knows About You</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {total} observation{total !== 1 ? "s" : ""} — Zev learns from every conversation
            </p>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-dungeon-600 w-3.5 h-3.5"
            />
            <span className="text-[10px] text-slate-500">Show removed</span>
          </label>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
              filterType === "all" ? "bg-dungeon-800 text-crimson-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            All
          </button>
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                filterType === key ? "bg-dungeon-800 text-crimson-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {TYPE_ICONS[key]} {label}
            </button>
          ))}
        </div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="dcc-card p-8 text-center">
          <p className="text-slate-400 text-sm">
            {filterType === "all"
              ? "Zev hasn't learned anything yet. Start chatting to build up memory."
              : `No ${TYPE_LABELS[filterType] || filterType} observations yet.`}
          </p>
        </div>
      ) : (
        Object.entries(grouped).map(([type, obs]) => (
          <div key={type} className="dcc-card p-4 space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>{TYPE_ICONS[type] || "📝"}</span>
              {TYPE_LABELS[type] || type}
              <span className="text-slate-600 font-normal">({obs.length})</span>
            </h4>
            <div className="space-y-1">
              {obs.map((o) => (
                <div
                  key={o.id}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    !o.is_active ? "opacity-40" : "hover:bg-dungeon-800/50"
                  }`}
                >
                  {editingId === o.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdate(o.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 bg-dungeon-800 border border-red-400 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none"
                        autoFocus
                      />
                      <button onClick={() => handleUpdate(o.id)} className="text-xs text-green-400">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-slate-500">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200">{o.observation}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            o.source_layer === "declared" ? "bg-blue-900/30 text-blue-400" :
                            o.source_layer === "observed" ? "bg-amber-900/30 text-amber-400" :
                            "bg-purple-900/30 text-purple-400"
                          }`}>
                            {o.source_layer}
                          </span>
                          <span className="text-[10px] text-slate-600">
                            {Math.round(o.confidence * 100)}% confidence
                          </span>
                          <span className="text-[10px] text-slate-600">
                            {new Date(o.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {o.is_active && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => { setEditingId(o.id); setEditContent(o.observation); }}
                            className="text-xs text-slate-500 hover:text-slate-300 px-1.5 py-1"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(o.id)}
                            className="text-xs text-slate-500 hover:text-red-400 px-1.5 py-1"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
