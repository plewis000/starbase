"use client";

import React, { useState, useEffect } from "react";

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

export default function SettingsPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"profile" | "integrations" | "notifications">("profile");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/user");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setIntegrations(data.integrations);
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, []);

  const tabs = [
    { id: "profile" as const, label: "Profile", icon: "👤" },
    { id: "integrations" as const, label: "Integrations", icon: "🔌" },
    { id: "notifications" as const, label: "Notifications", icon: "🔔" },
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
      <h1 className="text-2xl font-bold text-slate-100">Settings</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? "bg-slate-800 text-green-400"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && user && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
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
          {/* Discord */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center text-lg">💬</div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Discord (Zev)</h3>
                <p className="text-xs text-slate-400">AI assistant in your Discord server</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              integrations?.discord?.connected
                ? "bg-green-500/20 text-green-400"
                : "bg-slate-700 text-slate-400"
            }`}>
              {integrations?.discord?.connected ? "Connected" : "Not connected"}
            </span>
          </div>

          {/* Plaid */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center text-lg">🏦</div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Plaid</h3>
                <p className="text-xs text-slate-400">Bank account sync & transaction import</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              integrations?.plaid?.connected
                ? "bg-green-500/20 text-green-400"
                : "bg-slate-700 text-slate-400"
            }`}>
              {integrations?.plaid?.connected
                ? `${integrations.plaid.accounts} account${integrations.plaid.accounts !== 1 ? "s" : ""}`
                : "Not connected"}
            </span>
          </div>

          {/* Claude API */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center text-lg font-bold text-amber-400">Z</div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Claude API (Zev&apos;s Brain)</h3>
                <p className="text-xs text-slate-400">Powers AI responses and tool execution</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              integrations?.anthropic?.connected
                ? "bg-green-500/20 text-green-400"
                : "bg-slate-700 text-slate-400"
            }`}>
              {integrations?.anthropic?.connected ? "Active" : "Not configured"}
            </span>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === "notifications" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
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

      {/* Keyboard shortcuts */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
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
