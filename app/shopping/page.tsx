"use client";

import React, { useState, useEffect, useCallback } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";

interface ShoppingCategory {
  id: string;
  name: string;
  display_color?: string;
  icon?: string;
  sort_order: number;
}

interface ShoppingItem {
  id: string;
  list_id: string;
  name: string;
  quantity: string | null;
  category_id: string | null;
  checked: boolean;
  checked_at: string | null;
  is_staple: boolean;
  category?: ShoppingCategory | null;
  created_at: string;
}

interface ShoppingList {
  id: string;
  name: string;
  store: string | null;
  is_default: boolean;
  total_items: number;
  checked_items: number;
  items?: ShoppingItem[];
  created_at: string;
}

export default function ShoppingPage() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [activeList, setActiveList] = useState<ShoppingList | null>(null);
  const [categories, setCategories] = useState<ShoppingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [showNewListModal, setShowNewListModal] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListStore, setNewListStore] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");

  // Fetch all lists
  const fetchLists = useCallback(async () => {
    try {
      const res = await fetch("/api/shopping");
      if (res.ok) {
        const data = await res.json();
        setLists(data.lists || []);
        // Auto-select default or first list
        if (!activeListId && data.lists?.length > 0) {
          const defaultList = data.lists.find((l: ShoppingList) => l.is_default) || data.lists[0];
          setActiveListId(defaultList.id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch shopping lists:", err);
    } finally {
      setLoading(false);
    }
  }, [activeListId]);

  // Fetch active list with items
  const fetchActiveList = useCallback(async () => {
    if (!activeListId) return;
    setListLoading(true);
    try {
      const res = await fetch(`/api/shopping/${activeListId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveList(data.list);
      }
    } catch (err) {
      console.error("Failed to fetch list:", err);
    } finally {
      setListLoading(false);
    }
  }, [activeListId]);

  // Fetch categories
  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = await res.json();
          // Shopping categories aren't in the config endpoint yet, but we can use them from the list items
        }
      } catch {}
    }
    loadCategories();
  }, []);

  useEffect(() => { fetchLists(); }, [fetchLists]);
  useEffect(() => { fetchActiveList(); }, [fetchActiveList]);

  // Extract categories from items
  useEffect(() => {
    if (activeList?.items) {
      const catMap = new Map<string, ShoppingCategory>();
      for (const item of activeList.items) {
        if (item.category) catMap.set(item.category.id, item.category);
      }
      setCategories(Array.from(catMap.values()).sort((a, b) => a.sort_order - b.sort_order));
    }
  }, [activeList]);

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    try {
      const res = await fetch("/api/shopping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newListName.trim(),
          store: newListStore.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNewListModal(false);
        setNewListName("");
        setNewListStore("");
        setActiveListId(data.list.id);
        await fetchLists();
      }
    } catch (err) {
      console.error("Failed to create list:", err);
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim() || !activeListId) return;
    try {
      const res = await fetch(`/api/shopping/${activeListId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newItemName.trim(),
          quantity: newItemQty.trim() || null,
          category_id: newItemCategory || null,
        }),
      });
      if (res.ok) {
        setNewItemName("");
        setNewItemQty("");
        setNewItemCategory("");
        await fetchActiveList();
        await fetchLists();
      }
    } catch (err) {
      console.error("Failed to add item:", err);
    }
  };

  const handleToggleItem = async (itemId: string, checked: boolean) => {
    if (!activeListId) return;
    // Optimistic update
    setActiveList((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items?.map((item) =>
          item.id === itemId ? { ...item, checked } : item
        ),
      };
    });

    try {
      await fetch(`/api/shopping/${activeListId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked }),
      });
      await fetchLists(); // Update counts
    } catch (err) {
      console.error("Failed to toggle item:", err);
      await fetchActiveList(); // Revert on error
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!activeListId) return;
    try {
      await fetch(`/api/shopping/${activeListId}/items/${itemId}`, {
        method: "DELETE",
      });
      await fetchActiveList();
      await fetchLists();
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  };

  const handleClearChecked = async () => {
    if (!activeList?.items) return;
    const checkedItems = activeList.items.filter((i) => i.checked);
    await Promise.all(
      checkedItems.map((item) =>
        fetch(`/api/shopping/${activeListId}/items/${item.id}`, { method: "DELETE" })
      )
    );
    await fetchActiveList();
    await fetchLists();
  };

  const handleDeleteList = async () => {
    if (!activeListId) return;
    try {
      await fetch(`/api/shopping/${activeListId}`, { method: "DELETE" });
      setActiveListId(null);
      setActiveList(null);
      await fetchLists();
    } catch (err) {
      console.error("Failed to delete list:", err);
    }
  };

  // Group items by category
  const groupedItems = () => {
    if (!activeList?.items) return {};
    const groups: Record<string, ShoppingItem[]> = {};
    const unchecked = activeList.items.filter((i) => !i.checked);
    const checked = activeList.items.filter((i) => i.checked);

    for (const item of unchecked) {
      const catName = item.category?.name || "Uncategorized";
      if (!groups[catName]) groups[catName] = [];
      groups[catName].push(item);
    }

    if (checked.length > 0) {
      groups["Checked"] = checked;
    }

    return groups;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const items = activeList?.items || [];
  const uncheckedCount = items.filter((i) => !i.checked).length;
  const checkedCount = items.filter((i) => i.checked).length;
  const grouped = groupedItems();

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-slate-100">Shopping</h1>
          <button
            onClick={() => setShowNewListModal(true)}
            className="px-4 py-2 bg-green-400 hover:bg-green-500 text-slate-950 font-medium rounded-lg transition-colors text-sm"
          >
            New List
          </button>
        </div>

        {/* List tabs */}
        {lists.length > 0 && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {lists.map((list) => (
              <button
                key={list.id}
                onClick={() => setActiveListId(list.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeListId === list.id
                    ? "bg-green-400/10 text-green-400 border border-green-400/30"
                    : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-100 hover:border-slate-700"
                }`}
              >
                <span>{list.name}</span>
                {list.total_items > 0 && (
                  <span className="ml-2 text-xs opacity-60">
                    {list.checked_items}/{list.total_items}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {lists.length === 0 ? (
          <EmptyState
            icon="🛒"
            title="No shopping lists yet"
            description="Create your first shopping list to get started."
            action={{
              label: "Create List",
              onClick: () => setShowNewListModal(true),
            }}
          />
        ) : (
          <>
            {/* Add item form */}
            <div className="flex gap-2 mb-6">
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddItem();
                }}
                placeholder="Add item..."
                className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/30 transition-colors"
              />
              <input
                type="text"
                value={newItemQty}
                onChange={(e) => setNewItemQty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddItem();
                }}
                placeholder="Qty"
                className="w-20 px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/30 transition-colors text-center"
              />
              <button
                onClick={handleAddItem}
                disabled={!newItemName.trim()}
                className="px-4 py-2.5 bg-green-400 hover:bg-green-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 font-medium rounded-lg transition-colors"
              >
                Add
              </button>
            </div>

            {/* Items list */}
            {listLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner size="md" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🛒</div>
                <p className="text-slate-400">This list is empty. Add some items!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(grouped).map(([category, categoryItems]) => (
                  <div key={category}>
                    {/* Category header */}
                    <div className="flex items-center gap-2 mb-2">
                      {category !== "Uncategorized" && category !== "Checked" && (
                        <span className="text-sm">
                          {categoryItems[0]?.category?.icon || ""}
                        </span>
                      )}
                      {category === "Checked" && <span className="text-sm">✓</span>}
                      <h3 className={`text-sm font-semibold ${
                        category === "Checked" ? "text-slate-500" : "text-slate-300"
                      }`}>
                        {category}
                      </h3>
                      <span className="text-xs text-slate-500">({categoryItems.length})</span>
                    </div>

                    {/* Items */}
                    <div className="space-y-1">
                      {categoryItems.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-all group ${
                            item.checked
                              ? "bg-slate-900/50 border-slate-800/50"
                              : "bg-slate-900 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          {/* Checkbox */}
                          <button
                            onClick={() => handleToggleItem(item.id, !item.checked)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              item.checked
                                ? "border-green-400 bg-green-400/20"
                                : "border-slate-600 hover:border-green-400"
                            }`}
                          >
                            {item.checked && (
                              <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>

                          {/* Item name */}
                          <span className={`flex-1 text-sm ${
                            item.checked ? "text-slate-500 line-through" : "text-slate-100"
                          }`}>
                            {item.name}
                          </span>

                          {/* Quantity */}
                          {item.quantity && (
                            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                              {item.quantity}
                            </span>
                          )}

                          {/* Staple badge */}
                          {item.is_staple && (
                            <span className="text-xs text-amber-400" title="Staple item">
                              ★
                            </span>
                          )}

                          {/* Delete button */}
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Footer actions */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <span className="text-sm text-slate-400">
                    {uncheckedCount} remaining, {checkedCount} checked
                  </span>
                  <div className="flex gap-2">
                    {checkedCount > 0 && (
                      <button
                        onClick={handleClearChecked}
                        className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors"
                      >
                        Clear checked
                      </button>
                    )}
                    <button
                      onClick={handleDeleteList}
                      className="px-3 py-1.5 text-sm text-slate-500 hover:text-red-400 transition-colors"
                    >
                      Delete list
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* New List Modal */}
      <Modal
        isOpen={showNewListModal}
        onClose={() => setShowNewListModal(false)}
        title="New Shopping List"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-2">List Name *</label>
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateList(); }}
              placeholder="e.g., Weekly Groceries"
              autoFocus
              className="w-full bg-slate-800 border border-slate-700 rounded px-4 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-2">Store (optional)</label>
            <input
              type="text"
              value={newListStore}
              onChange={(e) => setNewListStore(e.target.value)}
              placeholder="e.g., Costco, Trader Joe's"
              className="w-full bg-slate-800 border border-slate-700 rounded px-4 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/50"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={() => setShowNewListModal(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateList}
              disabled={!newListName.trim()}
              className="px-4 py-2 bg-green-400 hover:bg-green-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 font-medium rounded transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
