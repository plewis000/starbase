"use client";

import React, { useState } from "react";

interface Thread {
  id: string;
  title: string;
  entity_type?: string;
  entity_id?: string;
  created_at: string;
  updated_at: string;
}

interface ThreadListProps {
  threads: Thread[];
  activeThreadId?: string;
  onSelectThread: (id: string) => void;
  onCreateThread: (title: string) => void;
  loading: boolean;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ThreadList({ threads, activeThreadId, onSelectThread, onCreateThread, loading }: ThreadListProps) {
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    onCreateThread(newTitle.trim());
    setNewTitle("");
    setShowNew(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-dungeon-800">
        <button
          onClick={() => setShowNew(!showNew)}
          className="w-full px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + New Thread
        </button>
      </div>

      {/* New thread form */}
      {showNew && (
        <div className="p-3 border-b border-dungeon-800 space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowNew(false); }}
            placeholder="Thread title..."
            className="w-full bg-dungeon-800 border border-dungeon-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-3 py-1.5 bg-red-600 text-white text-xs rounded font-medium">Create</button>
            <button onClick={() => setShowNew(false)} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
          </div>
        </div>
      )}

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-dungeon-700 border-t-red-500 rounded-full" />
          </div>
        ) : threads.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">No threads yet</p>
        ) : (
          threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => onSelectThread(thread.id)}
              className={`w-full text-left px-3 py-3 border-b border-dungeon-800/50 transition-colors ${
                activeThreadId === thread.id
                  ? "bg-red-900/10 border-l-2 border-l-red-500"
                  : "hover:bg-dungeon-800/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200 truncate">{thread.title}</span>
                <span className="text-[10px] text-slate-600 flex-shrink-0 ml-2">{formatTime(thread.updated_at)}</span>
              </div>
              {thread.entity_type && (
                <span className="text-[10px] text-slate-500 mt-0.5 inline-block">
                  Linked to {thread.entity_type}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
