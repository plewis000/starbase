"use client";

import React, { useState, useEffect } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { ChecklistItem } from "@/lib/types";
import { useTaskConfig, type HouseholdMember } from "@/hooks/useTaskConfig";

interface ChecklistWidgetProps {
  taskId: string;
  items: ChecklistItem[];
  onUpdate: () => void;
}

function getInitials(name?: string): string {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function AssigneeButton({ item, members, onAssign }: {
  item: ChecklistItem;
  members: HouseholdMember[];
  onAssign: (itemId: string, userId: string | null) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown); }}
        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold border transition-all flex-shrink-0"
        title={item.assignee?.full_name || "Assign"}
      >
        {item.assignee ? (
          item.assignee.avatar_url ? (
            <img src={item.assignee.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="bg-dungeon-700 text-slate-300 border-dungeon-600 w-full h-full rounded-full flex items-center justify-center">
              {getInitials(item.assignee.full_name)}
            </span>
          )
        ) : (
          <span className="bg-dungeon-800 text-dungeon-600 border-dungeon-700 border-dashed w-full h-full rounded-full flex items-center justify-center hover:text-dungeon-400">
            +
          </span>
        )}
      </button>
      {showDropdown && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-dungeon-800 border border-dungeon-700 rounded-lg shadow-xl py-1 min-w-[140px]">
          <button
            onClick={() => { onAssign(item.id, null); setShowDropdown(false); }}
            className="w-full text-left px-3 py-1.5 text-xs text-dungeon-400 hover:bg-dungeon-700 transition-colors"
          >
            Unassigned
          </button>
          {members.map((m) => (
            <button
              key={m.user_id}
              onClick={() => { onAssign(item.id, m.user_id); setShowDropdown(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-dungeon-700 transition-colors ${
                item.assigned_to === m.user_id ? "text-red-400 font-medium" : "text-slate-200"
              }`}
            >
              {m.user?.full_name || m.display_name || m.user_id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const { config } = useTaskConfig();

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

  const handleAssignItem = async (itemId: string, userId: string | null) => {
    try {
      const response = await fetch(
        `/api/tasks/${taskId}/checklist/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assigned_to: userId }),
        }
      );
      if (!response.ok) throw new Error("Failed to assign checklist item");

      // Find member info for optimistic update
      const member = config?.members.find((m) => m.user_id === userId);
      setItemsState((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                assigned_to: userId || undefined,
                assignee: member?.user
                  ? { id: member.user.id, full_name: member.user.full_name, avatar_url: member.user.avatar_url }
                  : undefined,
              }
            : item
        )
      );
      onUpdate();
    } catch {
      toast.error("Failed to assign item");
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
            <span className="text-dungeon-400">Progress</span>
            <span className="text-slate-100 font-medium">
              {checkedCount} of {itemsState.length} complete
            </span>
          </div>
          <div className="h-2 bg-dungeon-800 rounded-full overflow-hidden">
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
                className="w-4 h-4 rounded border-dungeon-700 bg-dungeon-800 text-red-400 cursor-pointer disabled:opacity-50"
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
                  className="flex-1 bg-dungeon-700 border border-red-400 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none"
                />
              ) : (
                <span
                  onClick={() => {
                    setEditingId(item.id);
                    setEditingTitle(item.title);
                  }}
                  className={`flex-1 text-sm cursor-pointer hover:text-red-300 transition-colors ${
                    item.checked
                      ? "text-dungeon-500 line-through"
                      : "text-slate-100"
                  }`}
                >
                  {item.title}
                </span>
              )}

              {/* Assignee avatar */}
              {config && (
                <AssigneeButton
                  item={item}
                  members={config.members}
                  onAssign={handleAssignItem}
                />
              )}

              <button
                onClick={() => handleDeleteItem(item.id)}
                className="opacity-0 group-hover:opacity-100 text-dungeon-500 hover:text-red-400 transition-all p-1"
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
          className="flex-1 bg-dungeon-800 border border-dungeon-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-dungeon-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
        />
        <button
          onClick={handleAddItem}
          disabled={addingItem || !newItemTitle.trim()}
          className="px-3 py-2 bg-red-400 hover:bg-red-500 disabled:bg-dungeon-700 disabled:cursor-not-allowed text-slate-950 text-sm font-medium rounded transition-colors"
        >
          {addingItem ? <LoadingSpinner size="sm" /> : "Add"}
        </button>
      </div>
    </div>
  );
}
