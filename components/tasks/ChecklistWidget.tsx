"use client";

import React, { useState } from "react";
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

      if (!response.ok) {
        throw new Error("Failed to update checklist item");
      }

      // Optimistic update
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

  const handleAddItem = async () => {
    if (!newItemTitle.trim()) return;

    setAddingItem(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newItemTitle.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to add checklist item");
      }

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
              className="h-full bg-green-400 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Checklist items */}
      {itemsState.length > 0 && (
        <div className="space-y-2">
          {itemsState.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => handleToggleItem(item.id, item.checked)}
                disabled={loading}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-green-400 cursor-pointer disabled:opacity-50"
              />
              <span
                className={`flex-1 text-sm ${
                  item.checked
                    ? "text-slate-500 line-through"
                    : "text-slate-100"
                }`}
              >
                {item.title}
              </span>
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
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              handleAddItem();
            }
          }}
          placeholder="Add item..."
          disabled={addingItem}
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/50 disabled:opacity-50"
        />
        <button
          onClick={handleAddItem}
          disabled={addingItem || !newItemTitle.trim()}
          className="px-3 py-2 bg-green-400 hover:bg-green-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 text-sm font-medium rounded transition-colors"
        >
          {addingItem ? <LoadingSpinner size="sm" /> : "Add"}
        </button>
      </div>
    </div>
  );
}
