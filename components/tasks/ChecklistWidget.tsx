"use client";

import React, { useState, useEffect } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { ChecklistItem } from "@/lib/types";

interface ChecklistWidgetProps {
  taskId: string;
  items: ChecklistItem[];
  onUpdate: () => void;
}

export default function ChecklistWidget({
  taskId,
  items,
  onUpdate,
}: ChecklistWidgetProps) {
  const [loading, setLoading] = useState(false);
  const [itemsState, setItemsState] = useState(items);
  const toast = useToast();
  const [newItemTitle, setNewItemTitle] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => { setItemsState(items); }, [items]);

  const checkedCount = itemsState.filter((item) => item.checked).length;
  const progressPercent =
    itemsState.length > 0 ? (checkedCount / itemsState.length) * 100 : 0;

  const handleToggleItem = async (itemId: string, currentChecked: boolean) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/tasks/${taskId}/checklist/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checked: !currentChecked }),
        }
      );
      if (!response.ok) throw new Error("Failed to update checklist item");

      setItemsState((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, checked: !currentChecked } : item
        )
      );
      onUpdate();
    } catch {
      toast.error("Failed to update checklist item");
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = async (itemId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setEditingId(null);
      return;
    }
    try {
      const response = await fetch(
        `/api/tasks/${taskId}/checklist/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle.trim() }),
        }
      );
      if (!response.ok) throw new Error("Failed to update checklist item");

      setItemsState((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, title: newTitle.trim() } : item
        )
      );
      onUpdate();
    } catch {
      toast.error("Failed to update item");
    } finally {
      setEditingId(null);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const response = await fetch(
        `/api/tasks/${taskId}/checklist/${itemId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete checklist item");

      setItemsState((prev) => prev.filter((item) => item.id !== itemId));
      onUpdate();
    } catch {
      toast.error("Failed to delete item");
    }
  };

  const handleAddItem = async () => {
    if (!newItemTitle.trim()) return;

    setAddingItem(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newItemTitle.trim() }),
      });
      if (!response.ok) throw new Error("Failed to add checklist item");

      const data = await response.json();
      setItemsState((prev) => [...prev, data.item]);
      setNewItemTitle("");
      onUpdate();
    } catch {
      toast.error("Failed to add checklist item");
    } finally {
      setAddingItem(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      {itemsState.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Progress</span>
            <span className="text-slate-100 font-medium">
              {checkedCount} of {itemsState.length} complete
            </span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-400 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Checklist items */}
      {itemsState.length > 0 && (
        <div className="space-y-2">
          {itemsState.map((item) => (
            <div key={item.id} className="flex items-center gap-3 group">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => handleToggleItem(item.id, item.checked)}
                disabled={loading}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-red-400 cursor-pointer disabled:opacity-50"
              />
              {editingId === item.id ? (
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => handleEditItem(item.id, editingTitle)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleEditItem(item.id, editingTitle);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className="flex-1 bg-slate-700 border border-red-400 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none"
                />
              ) : (
                <span
                  onClick={() => {
                    setEditingId(item.id);
                    setEditingTitle(item.title);
                  }}
                  className={`flex-1 text-sm cursor-pointer hover:text-red-300 transition-colors ${
                    item.checked
                      ? "text-slate-500 line-through"
                      : "text-slate-100"
                  }`}
                >
                  {item.title}
                </span>
              )}
              <button
                onClick={() => handleDeleteItem(item.id)}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1"
                title="Delete item"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add item input */}
      <div className="flex gap-2 pt-2">
        <input
          type="text"
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddItem();
          }}
          placeholder="Add item..."
          disabled={addingItem}
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
        />
        <button
          onClick={handleAddItem}
          disabled={addingItem || !newItemTitle.trim()}
          className="px-3 py-2 bg-red-400 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 text-sm font-medium rounded transition-colors"
        >
          {addingItem ? <LoadingSpinner size="sm" /> : "Add"}
        </button>
      </div>
    </div>
  );
}
