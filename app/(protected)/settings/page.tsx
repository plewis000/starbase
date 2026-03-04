"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";

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

const CONFIG_SECTIONS = [
  { table: "task_statuses", label: "Task Statuses" },
  { table: "task_priorities", label: "Task Priorities" },
  { table: "task_types", label: "Task Types" },
  { table: "effort_levels", label: "Effort Levels" },
];

export default function SettingsPage() {
  const toast = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"profile" | "integrations" | "notifications" | "customization">("profile");

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

  const tabs = [
    { id: "profile" as const, label: "Profile", icon: "👤" },
    { id: "integrations" as const, label: "Integrations", icon: "🔌" },
    { id: "notifications" as const, label: "Notifications", icon: "🔔" },
    { id: "customization" as const, label: "Customization", icon: "🎨" },
  ];

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-800 rounded w-48" />
          <div className="h-64 bg-slate-800 rounded-lg" />
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
              <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-xl font-bold text-slate-300">
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
              <p className="text-sm text-slate-300 font-mono bg-slate-800 px-3 py-2 rounded">{user.id}</p>
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
              integrations?.discord?.connected ? "bg-green-500/20 text-green-400" : "bg-slate-700 text-slate-400"
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
              integrations?.plaid?.connected ? "bg-green-500/20 text-green-400" : "bg-slate-700 text-slate-400"
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
              integrations?.anthropic?.connected ? "bg-green-500/20 text-green-400" : "bg-slate-700 text-slate-400"
            }`}>
              {integrations?.anthropic?.connected ? "Active" : "Not configured"}
            </span>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === "notifications" && (
        <div className="dcc-card p-6 space-y-4">
          <p className="text-sm text-slate-400">
            Notification preferences are managed in the Notifications page.
          </p>
          <a
            href="/notifications"
            className="inline-block px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-sm font-medium transition-colors"
          >
            Go to Notifications
          </a>
        </div>
      )}

      {/* Customization Tab */}
      {activeTab === "customization" && (
        <div className="space-y-6">
          {CONFIG_SECTIONS.map((section) => (
            <ConfigSection key={section.table} table={section.table} label={section.label} />
          ))}
        </div>
      )}

      {/* Keyboard shortcuts */}
      <div className="dcc-card p-6">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">Keyboard Shortcuts</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Command palette</span>
            <kbd className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700 text-xs">Cmd+K</kbd>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Close modal</span>
            <kbd className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700 text-xs">Esc</kbd>
          </div>
        </div>
      </div>
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
        <div className="animate-pulse h-20 bg-slate-800 rounded" />
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
              className="rounded border-slate-600 w-3.5 h-3.5"
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
        <div className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAdd(false); }}
            placeholder="Name..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400"
            autoFocus
          />
          <input
            type="color"
            value={newColor || "#64748b"}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-10 h-10 rounded border border-slate-700 bg-transparent cursor-pointer"
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
              isInactive ? "opacity-50" : "hover:bg-slate-800/50"
            }`}
          >
            {/* Sort order indicator */}
            <span className="text-[10px] text-slate-600 font-mono w-4">{idx + 1}</span>

            {/* Color swatch */}
            <div
              className="w-4 h-4 rounded-full flex-shrink-0 border border-slate-600"
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
                  className="flex-1 bg-slate-800 border border-red-400 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none"
                  autoFocus
                />
                <input
                  type="text"
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                  placeholder="Icon"
                  className="w-12 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-red-400"
                />
                <input
                  type="color"
                  value={editColor || item.display_color || "#64748b"}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
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
                    <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-slate-700 text-slate-400 rounded">
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
