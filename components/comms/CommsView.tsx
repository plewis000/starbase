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

  return (
    <div className="flex h-full">
      {/* Left panel: tabs + content */}
      <div className="w-80 flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-950/50">
        {/* Tab switcher */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab("threads")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "threads"
                ? "text-red-400 border-b-2 border-red-500"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Threads
          </button>
          <button
            onClick={() => setActiveTab("zev")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "zev"
                ? "text-amber-400 border-b-2 border-amber-500"
                : "text-slate-500 hover:text-slate-300"
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
              <p className="text-slate-400 text-sm">Select a thread or create a new one</p>
              <p className="text-slate-600 text-xs mt-1">Threads let you discuss tasks, goals, and ideas</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
