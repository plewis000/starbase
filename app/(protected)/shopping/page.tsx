"use client";

import React, { useState, useEffect, useCallback } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import CompletionCelebration from "@/components/ui/CompletionCelebration";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

// Parse quantity from item name: "2 lbs chicken" → { name: "chicken", quantity: "2 lbs" }
// Also handles: "milk x3", "3x eggs", "chicken (2 lbs)", "$50 headphones"
function parseItemInput(input: string): { name: string; quantity: string | null } {
  const trimmed = input.trim();

  // Pattern: "3x eggs" or "eggs x3"
  const xPattern = /^(\d+)\s*x\s+(.+)$/i;
  const xMatch = trimmed.match(xPattern);
  if (xMatch) return { name: xMatch[2].trim(), quantity: xMatch[1] };

  const trailingX = /^(.+?)\s+x(\d+)$/i;
  const trailingMatch = trimmed.match(trailingX);
  if (trailingMatch) return { name: trailingMatch[1].trim(), quantity: trailingMatch[2] };

  // Pattern: "$50 headphones" or "$19.99 book"
  const pricePattern = /^\$[\d,.]+\s+(.+)$/;
  const priceMatch = trimmed.match(pricePattern);
  if (priceMatch) return { name: trimmed, quantity: null }; // Keep price in name

  // Pattern: "2 lbs chicken", "1 gallon milk", "3 bags chips"
  const unitPattern = /^(\d+(?:\.\d+)?)\s+(lbs?|oz|kg|g|gallon|gallons|gal|bags?|boxes?|cans?|bottles?|packs?|bunche?s?|dozen|doz|ct|count|liters?|l)\s+(.+)$/i;
  const unitMatch = trimmed.match(unitPattern);
  if (unitMatch) return { name: unitMatch[3].trim(), quantity: `${unitMatch[1]} ${unitMatch[2]}` };

  // Pattern: "chicken (2 lbs)" or "headphones ($50)"
  const parenPattern = /^(.+?)\s*\((.+?)\)\s*$/;
  const parenMatch = trimmed.match(parenPattern);
  if (parenMatch) return { name: parenMatch[1].trim(), quantity: parenMatch[2].trim() };

  // Pattern: just a number prefix "3 apples"
  const numPrefix = /^(\d+)\s+(.+)$/;
  const numMatch = trimmed.match(numPrefix);
  if (numMatch) return { name: numMatch[2].trim(), quantity: numMatch[1] };

  return { name: trimmed, quantity: null };
}

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

const LIST_TEMPLATES = [
  { name: "Groceries", store: "" },
  { name: "Wishlist", store: "" },
  { name: "Home & Hardware", store: "" },
  { name: "Errands", store: "" },
];

export default function ShoppingPage() {
  const toast = useToast();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [trackingItemId, setTrackingItemId] = useState<string | null>(null);
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
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [linkedItemIds, setLinkedItemIds] = useState<Set<string>>(new Set());
  const [showCelebration, setShowCelebration] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  useEffect(() => { fetchLists(); }, [fetchLists]);
  useEffect(() => { fetchActiveList(); }, [fetchActiveList]);

  // Check which shopping items have entity links (single batch request)
  useEffect(() => {
    if (!activeList?.items || activeList.items.length === 0) {
      setLinkedItemIds(new Set());
      return;
    }
    const checkLinks = async () => {
      try {
        const ids = activeList.items!.map((i) => i.id);
        const res = await fetch("/api/entity-links/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_type: "shopping_item", entity_ids: ids }),
        });
        if (res.ok) {
          const data = await res.json();
          setLinkedItemIds(new Set(Object.keys(data.linked || {})));
        }
      } catch {
        // Best effort
      }
    };
    checkLinks();
  }, [activeList]);

  // Fetch categories from config
  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = await res.json();
          if (data.shopping_categories) {
            setCategories(data.shopping_categories.sort((a: ShoppingCategory, b: ShoppingCategory) => a.sort_order - b.sort_order));
          }
        }
      } catch { /* silent */ }
    }
    loadCategories();
  }, []);

  const handleCreateList = async (name?: string, store?: string) => {
    const listName = name || newListName.trim();
    const listStore = store || newListStore.trim() || null;
    if (!listName) return;
    try {
      const res = await fetch("/api/shopping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: listName, store: listStore }),
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

    // Smart parse: extract quantity from name if qty field is empty
    let itemName = newItemName.trim();
    let itemQty = newItemQty.trim() || null;

    if (!itemQty) {
      const parsed = parseItemInput(itemName);
      itemName = parsed.name;
      itemQty = parsed.quantity;
    }

    try {
      const res = await fetch(`/api/shopping/${activeListId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: itemName,
          quantity: itemQty,
          category_id: newItemCategory || null,
        }),
      });
      if (res.ok) {
        setNewItemName("");
        setNewItemQty("");
        setNewItemCategory("");
        toast.success("Item added");
        await fetchActiveList();
        await fetchLists();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to add item");
      }
    } catch {
      toast.error("Failed to add item");
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
      // If checking off a linked item, trigger completion sync
      if (checked && linkedItemIds.has(itemId)) {
        fetch("/api/entity-links/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_type: "shopping_item", entity_id: itemId }),
        }).catch(() => {}); // Fire-and-forget
      }
      // Celebrate when all items are checked off
      if (checked) {
        const updatedItems = activeList?.items?.map((i) =>
          i.id === itemId ? { ...i, checked: true } : i
        );
        const allChecked = updatedItems?.every((i) => i.checked);
        if (allChecked && updatedItems && updatedItems.length > 0) {
          setShowCelebration(true);
          toast.success("All done!");
        }
      }
      await fetchLists(); // Update counts
    } catch (err) {
      console.error("Failed to toggle item:", err);
      await fetchActiveList(); // Revert on error
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!activeListId) return;
    // Optimistic removal
    setActiveList((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items?.filter((i) => i.id !== itemId) };
    });
    try {
      await fetch(`/api/shopping/${activeListId}/items/${itemId}`, { method: "DELETE" });
      await fetchLists();
    } catch (err) {
      console.error("Failed to delete item:", err);
      await fetchActiveList();
    }
  };

  const handleClearChecked = async () => {
    if (!activeList?.items) return;
    const checkedItems = activeList.items.filter((i) => i.checked);
    if (checkedItems.length === 0) return;

    // Optimistic removal
    setActiveList((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items?.filter((i) => !i.checked) };
    });

    try {
      await Promise.all(
        checkedItems.map((item) =>
          fetch(`/api/shopping/${activeListId}/items/${item.id}`, { method: "DELETE" })
        )
      );
      toast.success(`Cleared ${checkedItems.length} item${checkedItems.length > 1 ? "s" : ""}`);
      await fetchLists();
    } catch {
      toast.error("Failed to clear items");
      await fetchActiveList(); // Revert
    }
  };

  const handleDeleteList = async () => {
    if (!activeListId) return;
    try {
      const listName = lists.find((l) => l.id === activeListId)?.name || "list";
      await fetch(`/api/shopping/${activeListId}`, { method: "DELETE" });
      setActiveListId(null);
      setActiveList(null);
      setShowDeleteConfirm(false);
      toast.success(`Deleted "${listName}"`);
      await fetchLists();
    } catch {
      toast.error("Failed to delete list");
    }
  };

  const handleTrackAsTask = async (item: ShoppingItem) => {
    setTrackingItemId(item.id);
    try {
      const taskRes = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Buy: ${item.name}${item.quantity ? ` (${item.quantity})` : ""}`,
        }),
      });
      if (!taskRes.ok) throw new Error("Failed to create task");
      const taskData = await taskRes.json();
      const taskId = taskData.task?.id;
      if (!taskId) throw new Error("No task ID returned");

      const linkRes = await fetch("/api/entity-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: "shopping_item",
          source_id: item.id,
          target_type: "task",
          target_id: taskId,
          link_type: "syncs_with",
          sync_completion: true,
        }),
      });
      if (!linkRes.ok && linkRes.status !== 409) {
        throw new Error("Failed to create link");
      }

      setLinkedItemIds((prev) => new Set([...prev, item.id]));
      toast.success(`Task created for "${item.name}"`);
    } catch {
      toast.error("Failed to track as task");
    } finally {
      setTrackingItemId(null);
    }
  };

  // Group items: unchecked by category, checked at bottom
  const groupedItems = () => {
    if (!activeList?.items) return {};
    const groups: Record<string, ShoppingItem[]> = {};
    const unchecked = activeList.items.filter((i) => !i.checked);
    const checked = activeList.items.filter((i) => i.checked);

    // If any items have categories, group by category
    const hasCategories = unchecked.some((i) => i.category);
    if (hasCategories) {
      for (const item of unchecked) {
        const catName = item.category?.name || "Other";
        if (!groups[catName]) groups[catName] = [];
        groups[catName].push(item);
      }
    } else {
      // No categories — just show as a flat list
      if (unchecked.length > 0) {
        groups["Items"] = unchecked;
      }
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
    <div>
      <CompletionCelebration
        show={showCelebration}
        onComplete={() => setShowCelebration(false)}
      />
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-slate-100">Shopping</h1>
          <button
            onClick={() => setShowNewListModal(true)}
            className="px-4 py-2 bg-red-400 hover:bg-red-500 text-slate-950 font-medium rounded-lg transition-colors text-sm"
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
                    ? "bg-red-400/10 text-red-400 border border-red-400/30"
                    : "bg-dungeon-900 text-dungeon-400 border border-dungeon-800 hover:text-slate-100 hover:border-dungeon-700"
                }`}
              >
                <span>{list.name}</span>
                {list.store && (
                  <span className="ml-1.5 text-xs opacity-50">{list.store}</span>
                )}
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
          <div className="space-y-6">
            <EmptyState
              icon="📋"
              title="No lists yet"
              description="Create lists for groceries, wishlists, home projects, or anything you need to buy or track."
              action={{
                label: "Create a List",
                onClick: () => setShowNewListModal(true),
              }}
            />
            {/* Quick-start templates */}
            <div className="flex flex-wrap gap-2 justify-center">
              {LIST_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.name}
                  onClick={() => handleCreateList(tmpl.name, tmpl.store)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-dungeon-900 border border-dungeon-800 text-dungeon-400 hover:text-slate-200 hover:border-dungeon-600 transition-all"
                >
                  {tmpl.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Add item form */}
            <div className="flex flex-wrap gap-2 mb-6">
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddItem();
                }}
                placeholder="Add an item..."
                className="flex-1 min-w-[200px] px-4 py-2.5 bg-dungeon-900 border border-dungeon-800 rounded-lg text-slate-100 placeholder-dungeon-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/30 transition-colors"
              />
              <input
                type="text"
                value={newItemQty}
                onChange={(e) => setNewItemQty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddItem();
                }}
                placeholder="Qty"
                className="w-24 px-3 py-2.5 bg-dungeon-900 border border-dungeon-800 rounded-lg text-slate-100 placeholder-dungeon-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/30 transition-colors text-center"
              />
              {/* Category toggle — only show picker if categories exist and user wants it */}
              {categories.length > 0 && (
                <>
                  <button
                    onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                    className={`px-3 py-2.5 rounded-lg text-sm border transition-colors ${
                      showCategoryPicker || newItemCategory
                        ? "bg-dungeon-800 border-red-400/30 text-red-400"
                        : "bg-dungeon-900 border-dungeon-800 text-dungeon-500 hover:text-slate-300 hover:border-dungeon-700"
                    }`}
                    title="Set category"
                  >
                    {newItemCategory
                      ? categories.find((c) => c.id === newItemCategory)?.name || "Category"
                      : "Category"}
                  </button>
                  {showCategoryPicker && (
                    <select
                      value={newItemCategory}
                      onChange={(e) => {
                        setNewItemCategory(e.target.value);
                        setShowCategoryPicker(false);
                      }}
                      autoFocus
                      className="w-36 px-3 py-2.5 bg-dungeon-900 border border-dungeon-800 rounded-lg text-slate-100 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/30 transition-colors text-sm"
                    >
                      <option value="">No category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon ? `${cat.icon} ` : ""}{cat.name}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
              <button
                onClick={handleAddItem}
                disabled={!newItemName.trim()}
                className="px-4 py-2.5 bg-red-400 hover:bg-red-500 disabled:bg-dungeon-700 disabled:cursor-not-allowed text-slate-950 font-medium rounded-lg transition-colors"
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
                <div className="text-4xl mb-3">📋</div>
                <p className="text-slate-300 font-medium mb-1">This list is empty</p>
                <p className="text-dungeon-500 text-sm">Type an item above and press Enter</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(grouped).map(([category, categoryItems]) => (
                  <div key={category}>
                    {/* Category header — hide generic "Items" header if only one group */}
                    {category !== "Items" && (
                      <div className="flex items-center gap-2 mb-2">
                        {category !== "Checked" && (
                          <span className="text-sm">
                            {categoryItems[0]?.category?.icon || ""}
                          </span>
                        )}
                        {category === "Checked" && <span className="text-sm text-dungeon-600">✓</span>}
                        <h3 className={`text-sm font-semibold ${
                          category === "Checked" ? "text-dungeon-500" : "text-slate-300"
                        }`}>
                          {category}
                        </h3>
                        <span className="text-xs text-dungeon-500">({categoryItems.length})</span>
                      </div>
                    )}

                    {/* Items */}
                    <div className="space-y-1">
                      {categoryItems.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-all group ${
                            item.checked
                              ? "bg-dungeon-900/50 border-dungeon-800/50"
                              : "bg-dungeon-900 border-dungeon-800 hover:border-dungeon-700"
                          }`}
                        >
                          {/* Checkbox */}
                          <button
                            onClick={() => handleToggleItem(item.id, !item.checked)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              item.checked
                                ? "border-red-400 bg-red-400/20"
                                : "border-dungeon-600 hover:border-red-400"
                            }`}
                          >
                            {item.checked && (
                              <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>

                          {/* Item name */}
                          <span className={`flex-1 text-sm transition-all duration-300 ${
                            item.checked ? "text-dungeon-500 line-through opacity-60" : "text-slate-100"
                          }`}>
                            {item.name}
                          </span>

                          {/* Quantity badge */}
                          {item.quantity && (
                            <span className="text-xs text-dungeon-400 bg-dungeon-800 px-2 py-0.5 rounded">
                              {item.quantity}
                            </span>
                          )}

                          {/* Staple indicator */}
                          <button
                            onClick={async () => {
                              try {
                                await fetch(`/api/shopping/${activeListId}/items/${item.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ is_staple: !item.is_staple }),
                                });
                                setActiveList((prev) => {
                                  if (!prev) return prev;
                                  return { ...prev, items: prev.items?.map((i) =>
                                    i.id === item.id ? { ...i, is_staple: !i.is_staple } : i
                                  )};
                                });
                              } catch { /* silent */ }
                            }}
                            className={`text-xs transition-colors flex-shrink-0 ${
                              item.is_staple ? "text-amber-400" : "text-dungeon-600 opacity-0 group-hover:opacity-100 hover:text-amber-400"
                            }`}
                            title={item.is_staple ? "Remove from staples" : "Mark as staple (auto-adds to new lists)"}
                          >
                            ★
                          </button>

                          {/* Linked badge */}
                          {linkedItemIds.has(item.id) && (
                            <span className="text-xs text-blue-400" title="Linked to task">
                              ⚡
                            </span>
                          )}

                          {/* Track as task button */}
                          {!item.checked && !linkedItemIds.has(item.id) && (
                            <button
                              onClick={() => handleTrackAsTask(item)}
                              disabled={trackingItemId === item.id}
                              className="opacity-0 group-hover:opacity-100 text-dungeon-500 hover:text-blue-400 transition-all p-1 flex-shrink-0"
                              title="Track as task"
                            >
                              {trackingItemId === item.id ? (
                                <span className="text-xs">...</span>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                  <line x1="12" y1="8" x2="12" y2="16" />
                                  <line x1="8" y1="12" x2="16" y2="12" />
                                </svg>
                              )}
                            </button>
                          )}

                          {/* Delete button */}
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-dungeon-500 hover:text-red-400 transition-all p-1"
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
                <div className="flex items-center justify-between pt-4 border-t border-dungeon-800">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-dungeon-400">
                      {uncheckedCount} remaining{checkedCount > 0 ? `, ${checkedCount} done` : ""}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {checkedCount > 0 && (
                      <button
                        onClick={handleClearChecked}
                        className="px-3 py-1.5 text-sm text-dungeon-400 hover:text-slate-100 bg-dungeon-900 border border-dungeon-800 rounded-lg hover:border-dungeon-700 transition-colors"
                      >
                        Clear done
                      </button>
                    )}
                    {showDeleteConfirm ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-dungeon-400">Delete this list?</span>
                        <button
                          onClick={handleDeleteList}
                          className="px-2 py-1 text-xs text-red-400 border border-red-400/30 rounded hover:bg-red-400/10 transition-colors"
                        >
                          Yes, delete
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="px-2 py-1 text-xs text-dungeon-400 border border-dungeon-700 rounded hover:bg-dungeon-800 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-3 py-1.5 text-sm text-dungeon-500 hover:text-red-400 transition-colors"
                      >
                        Delete list
                      </button>
                    )}
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
        title="New List"
      >
        <div className="space-y-4">
          {/* Quick templates */}
          <div>
            <label className="block text-xs font-medium text-dungeon-400 mb-2">Quick start</label>
            <div className="flex flex-wrap gap-2">
              {LIST_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.name}
                  onClick={() => {
                    handleCreateList(tmpl.name, tmpl.store);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-dungeon-800 border border-dungeon-700 text-dungeon-400 hover:text-slate-200 hover:border-dungeon-600 transition-all"
                >
                  {tmpl.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-dungeon-700" />
            <span className="text-xs text-dungeon-500">or custom</span>
            <div className="flex-1 h-px bg-dungeon-700" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-2">List Name</label>
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateList(); }}
              placeholder="e.g., Holiday gifts, Home renovation, Amazon"
              autoFocus
              className="w-full bg-dungeon-800 border border-dungeon-700 rounded px-4 py-2 text-slate-100 placeholder-dungeon-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-2">Store (optional)</label>
            <input
              type="text"
              value={newListStore}
              onChange={(e) => setNewListStore(e.target.value)}
              placeholder="e.g., Amazon, Costco, Home Depot"
              className="w-full bg-dungeon-800 border border-dungeon-700 rounded px-4 py-2 text-slate-100 placeholder-dungeon-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={() => setShowNewListModal(false)}
              className="px-4 py-2 bg-dungeon-800 hover:bg-dungeon-700 text-slate-100 font-medium rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleCreateList()}
              disabled={!newListName.trim()}
              className="px-4 py-2 bg-red-400 hover:bg-red-500 disabled:bg-dungeon-700 disabled:cursor-not-allowed text-slate-950 font-medium rounded transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
