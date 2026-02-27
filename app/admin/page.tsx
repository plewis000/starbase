"use client";

import React, { useState, useEffect, useCallback } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface ConfigRow {
  id: string;
  name: string;
  display_color?: string;
  icon?: string;
  sort_order: number;
  active: boolean;
  slug?: string;
  [key: string]: unknown;
}

const CONFIG_TABLES = [
  { key: "task_statuses", label: "Task Statuses" },
  { key: "task_priorities", label: "Task Priorities" },
  { key: "task_types", label: "Task Types" },
  { key: "effort_levels", label: "Effort Levels" },
  { key: "location_contexts", label: "Location Contexts" },
  { key: "goal_categories", label: "Goal Categories" },
  { key: "goal_timeframes", label: "Goal Timeframes" },
  { key: "habit_frequencies", label: "Habit Frequencies" },
  { key: "habit_time_preferences", label: "Time Preferences" },
  { key: "shopping_categories", label: "Shopping Categories" },
];

export default function AdminPage() {
  const [activeTable, setActiveTable] = useState(CONFIG_TABLES[0].key);
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ConfigRow>>({});
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRow, setNewRow] = useState<Partial<ConfigRow>>({ name: "", icon: "", display_color: "", sort_order: 0, active: true });
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/config?table=${activeTable}`);
      if (res.status === 403) {
        setError("Admin access required. Your account doesn't have admin privileges.");
        setRows([]);
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch config");
      const data = await res.json();
      setRows(data.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [activeTable]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleEdit = (row: ConfigRow) => {
    setEditingId(row.id);
    setEditData({ name: row.name, icon: row.icon, display_color: row.display_color, sort_order: row.sort_order, active: row.active });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: activeTable, id: editingId, ...editData }),
      });
      if (res.ok) {
        setEditingId(null);
        setEditData({});
        await fetchRows();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update");
      }
    } catch (err) {
      setError("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRow = async () => {
    if (!newRow.name?.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: activeTable, ...newRow }),
      });
      if (res.ok) {
        setShowAddRow(false);
        setNewRow({ name: "", icon: "", display_color: "", sort_order: 0, active: true });
        await fetchRows();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create");
      }
    } catch (err) {
      setError("Failed to create row");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (row: ConfigRow) => {
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: activeTable, id: row.id, active: !row.active }),
      });
      if (res.ok) await fetchRows();
    } catch (err) {
      console.error("Failed to toggle:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">Admin Config</h1>
            <p className="text-sm text-slate-400 mt-1">Manage lookup tables for statuses, priorities, categories, and more.</p>
          </div>
        </div>

        {/* Table tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-slate-800">
          {CONFIG_TABLES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setActiveTable(t.key); setEditingId(null); setShowAddRow(false); }}
              className={`flex-shrink-0 px-3 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTable === t.key
                  ? "text-green-400 border-green-400"
                  : "text-slate-400 border-transparent hover:text-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
            <button onClick={() => setError("")} className="ml-2 text-red-300 hover:text-red-100">Dismiss</button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
        ) : (
          <div>
            {/* Add button */}
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowAddRow(!showAddRow)}
                className="px-4 py-2 bg-green-400 hover:bg-green-500 text-slate-950 font-medium rounded-lg transition-colors text-sm"
              >
                {showAddRow ? "Cancel" : "Add New"}
              </button>
            </div>

            {/* Add new row form */}
            {showAddRow && (
              <div className="mb-4 p-4 bg-slate-900 border border-green-400/30 rounded-lg space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <input
                    type="text"
                    value={newRow.name || ""}
                    onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
                    placeholder="Name *"
                    className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400 col-span-2 md:col-span-1"
                  />
                  <input
                    type="text"
                    value={newRow.icon || ""}
                    onChange={(e) => setNewRow({ ...newRow, icon: e.target.value })}
                    placeholder="Icon (emoji)"
                    className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400"
                  />
                  <input
                    type="text"
                    value={newRow.display_color || ""}
                    onChange={(e) => setNewRow({ ...newRow, display_color: e.target.value })}
                    placeholder="Color (#hex)"
                    className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400"
                  />
                  <input
                    type="number"
                    value={newRow.sort_order ?? 0}
                    onChange={(e) => setNewRow({ ...newRow, sort_order: parseInt(e.target.value) || 0 })}
                    placeholder="Sort order"
                    className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400"
                  />
                  <button
                    onClick={handleAddRow}
                    disabled={saving || !newRow.name?.trim()}
                    className="px-4 py-2 bg-green-400 hover:bg-green-500 disabled:bg-slate-700 text-slate-950 font-medium rounded text-sm transition-colors"
                  >
                    {saving ? "Saving..." : "Create"}
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Icon</th>
                    <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Name</th>
                    <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Color</th>
                    <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Order</th>
                    <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3">Active</th>
                    <th className="text-right text-xs font-semibold text-slate-400 px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      {editingId === row.id ? (
                        <>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editData.icon || ""}
                              onChange={(e) => setEditData({ ...editData, icon: e.target.value })}
                              className="w-12 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 text-center focus:outline-none focus:border-green-400"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editData.name || ""}
                              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-green-400"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editData.display_color || ""}
                                onChange={(e) => setEditData({ ...editData, display_color: e.target.value })}
                                className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-green-400"
                              />
                              {editData.display_color && (
                                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: editData.display_color }} />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              value={editData.sort_order ?? 0}
                              onChange={(e) => setEditData({ ...editData, sort_order: parseInt(e.target.value) || 0 })}
                              className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 text-center focus:outline-none focus:border-green-400"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setEditData({ ...editData, active: !editData.active })}
                              className={`px-2 py-1 rounded text-xs font-medium ${editData.active ? "bg-green-400/10 text-green-400" : "bg-slate-800 text-slate-500"}`}
                            >
                              {editData.active ? "Active" : "Inactive"}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={handleSaveEdit}
                                disabled={saving}
                                className="px-3 py-1 bg-green-400 hover:bg-green-500 text-slate-950 text-xs font-medium rounded transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => { setEditingId(null); setEditData({}); }}
                                className="px-3 py-1 text-slate-400 hover:text-slate-100 text-xs font-medium transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-lg">{row.icon || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-medium ${row.active ? "text-slate-100" : "text-slate-500"}`}>
                              {row.name}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {row.display_color ? (
                                <>
                                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: row.display_color }} />
                                  <span className="text-xs text-slate-400 font-mono">{row.display_color}</span>
                                </>
                              ) : (
                                <span className="text-xs text-slate-600">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-400 text-center">{row.sort_order}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleToggleActive(row)}
                              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                row.active
                                  ? "bg-green-400/10 text-green-400 hover:bg-green-400/20"
                                  : "bg-slate-800 text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              {row.active ? "Active" : "Inactive"}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleEdit(row)}
                              className="px-3 py-1 text-slate-400 hover:text-slate-100 text-xs font-medium transition-colors"
                            >
                              Edit
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                        No rows found for this table.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-500 mt-4">
              {rows.length} rows total. Changes are saved immediately.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
