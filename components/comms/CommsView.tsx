"use client";

import React, { useState, useEffect, useCallback } from "react";
import ThreadList from "./ThreadList";
import ThreadDetail from "./ThreadDetail";
import ZevPanel from "./ZevPanel";

interface Thread {
  id: string;
  title: string;
  entity_type?: string;
  entity_id?: string;
  created_at: string;
  updated_at: string;
}

type Tab = "threads" | "zev";

export default function CommsView() {
  const [activeTab, setActiveTab] = useState<Tab>("threads");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/threads");
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  const handleCreateThread = async (title: string) => {
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const data = await res.json();
        setThreads((prev) => [data.thread, ...prev]);
        setActiveThreadId(data.thread.id);
        setActiveThread(data.thread);
      }
    } catch { /* silent */ }
  };

  const handleSelectThread = async (id: string) => {
    setActiveThreadId(id);
    const thread = threads.find((t) => t.id === id);
    setActiveThread(thread || null);
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full">
      {/* Mobile toggle button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed bottom-4 left-4 z-50 bg-crimson-600 hover:bg-crimson-500 text-white p-3 rounded-full shadow-lg"
        aria-label="Toggle sidebar"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left panel: tabs + content */}
      <div className={`w-80 flex-shrink-0 border-r border-dungeon-800 flex flex-col bg-dungeon-950/50 ${
        sidebarOpen ? "fixed inset-y-0 left-0 z-50" : "hidden"
      } md:relative md:flex`}>
        {/* Tab switcher */}
        <div className="flex border-b border-dungeon-800">
          <button
            onClick={() => setActiveTab("threads")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "threads"
                ? "text-red-400 border-b-2 border-red-500"
                : "text-dungeon-500 hover:text-slate-300"
            }`}
          >
            Threads
          </button>
          <button
            onClick={() => setActiveTab("zev")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "zev"
                ? "text-amber-400 border-b-2 border-amber-500"
                : "text-dungeon-500 hover:text-slate-300"
            }`}
          >
            Zev
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "threads" ? (
            <ThreadList
              threads={threads}
              activeThreadId={activeThreadId || undefined}
              onSelectThread={handleSelectThread}
              onCreateThread={handleCreateThread}
              loading={loading}
            />
          ) : (
            <ZevPanel />
          )}
        </div>
      </div>

      {/* Right panel: thread detail */}
      <div className="flex-1 min-w-0">
        {activeTab === "threads" && activeThread ? (
          <ThreadDetail
            thread={activeThread}
            onClose={() => { setActiveThreadId(null); setActiveThread(null); }}
          />
        ) : activeTab === "threads" ? (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <div className="text-4xl mb-3">💬</div>
              <p className="text-dungeon-400 text-sm">Select a thread or create a new one</p>
              <p className="text-dungeon-600 text-xs mt-1">Threads let you discuss tasks, goals, and ideas</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
