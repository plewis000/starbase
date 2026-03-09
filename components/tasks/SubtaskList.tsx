"use client";

import React, { useState, useEffect } from "react";

interface Subtask {
  id: string;
  title: string;
  status?: { id: string; name: string };
  due_date?: string;
  completed_at?: string | null;
}

interface SubtaskListProps {
  parentTaskId: string;
  onSelect?: (id: string) => void;
}

export default function SubtaskList({ parentTaskId, onSelect }: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchSubtasks = async () => {
    try {
      const res = await fetch(`/api/tasks/${parentTaskId}/subtasks`);
      if (res.ok) {
        const data = await res.json();
        setSubtasks(data.subtasks || []);
      }
    } catch {
      console.error("Failed to fetch subtasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubtasks();
  }, [parentTaskId]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/tasks/${parentTaskId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setNewTitle("");
        await fetchSubtasks();
      }
    } catch {
      console.error("Failed to create subtask");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <p className="text-xs text-dungeon-500">Loading subtasks...</p>;
  }

  const done = subtasks.filter((s) => s.completed_at).length;

  return (
    <div className="space-y-2">
      {subtasks.length > 0 && (
        <p className="text-xs text-dungeon-400 font-medium">
          {done}/{subtasks.length} done
        </p>
      )}

      {subtasks.map((st) => (
        <div
          key={st.id}
          onClick={() => onSelect?.(st.id)}
          className="flex items-center gap-2 p-2 bg-dungeon-900 rounded border border-dungeon-800 hover:border-dungeon-600 cursor-pointer transition-colors"
        >
          <div
            className={`w-4 h-4 rounded-full flex-shrink-0 ${
              st.completed_at ? "bg-red-400" : "bg-dungeon-700 border border-dungeon-600"
            }`}
          />
          <span
            className={`text-sm flex-1 truncate ${
              st.completed_at ? "text-dungeon-400 line-through" : "text-slate-100"
            }`}
          >
            {st.title}
          </span>
          {st.status && !st.completed_at && (
            <span className="text-[10px] text-dungeon-500 font-medium">
              {st.status.name}
            </span>
          )}
        </div>
      ))}

      <div className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreate();
            }
          }}
          placeholder="Add subtask..."
          disabled={creating}
          className="flex-1 bg-dungeon-800 border border-dungeon-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-dungeon-500 focus:outline-none focus:border-red-400 disabled:opacity-50"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newTitle.trim()}
          className="px-3 py-1.5 text-xs font-medium bg-dungeon-800 hover:bg-dungeon-700 text-slate-300 rounded transition-colors disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
