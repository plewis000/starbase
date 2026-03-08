"use client";

import React, { useState } from "react";
import DatePicker from "@/components/ui/DatePicker";
import { ConfigOption, HouseholdMember } from "@/hooks/useTaskConfig";

// ─── Shared helpers ─────────────────────────────────────────────────────

async function patchTask(taskId: string, data: Record<string, unknown>) {
  const res = await fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Update failed");
  return res.json();
}

async function addConfigOption(table: string, name: string, color?: string) {
  const res = await fetch("/api/admin/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, name, display_color: color }),
  });
  if (!res.ok) throw new Error("Failed to add option");
  return res.json();
}

// ─── Status Picker ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  "To Do": "bg-dungeon-600 text-slate-100",
  "In Progress": "bg-blue-500/20 text-blue-300 border-blue-500/40",
  "Blocked": "bg-red-500/20 text-red-300 border-red-500/40",
  "Done": "bg-green-500/20 text-green-300 border-green-500/40",
  "Someday": "bg-purple-500/20 text-purple-300 border-purple-500/40",
};

export function InlineStatusPicker({
  taskId,
  currentValue,
  options,
  onUpdated,
  onConfigAdded,
  onBeforeUpdate,
}: {
  taskId: string;
  currentValue: string;
  options: ConfigOption[];
  onUpdated: () => void;
  onConfigAdded?: () => void;
  /** Return false to cancel the update (e.g., to show a credit modal first). The callback receives the status id and name. */
  onBeforeUpdate?: (statusId: string, statusName: string) => boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  const handleSelect = async (id: string) => {
    if (id === currentValue || saving) return;
    // Allow caller to intercept (e.g., for credit modal)
    if (onBeforeUpdate) {
      const opt = options.find((o) => o.id === id);
      const shouldProceed = onBeforeUpdate(id, opt?.name || "");
      if (!shouldProceed) return;
    }
    setSaving(true);
    try {
      await patchTask(taskId, { status_id: id });
      onUpdated();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await addConfigOption("task_statuses", newName.trim());
      setNewName("");
      setShowAdd(false);
      onConfigAdded?.();
    } catch { /* silent */ }
  };

  return (
    <div className={`flex flex-wrap gap-1.5 ${saving ? "opacity-60 pointer-events-none" : ""}`}>
      {options.map((opt) => {
        const colors = STATUS_COLORS[opt.name] || "bg-dungeon-700 text-slate-300";
        return (
          <button
            key={opt.id}
            onClick={() => handleSelect(opt.id)}
            className={`min-h-[44px] px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${colors} ${
              opt.id === currentValue ? "ring-2 ring-red-400/60 border-transparent" : "border-transparent hover:ring-1 hover:ring-dungeon-500"
            }`}
          >
            {opt.icon && <span className="mr-1">{opt.icon}</span>}
            {opt.name}
          </button>
        );
      })}
      {showAdd ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAdd(false); }}
            placeholder="New status..."
            className="min-h-[44px] px-2 py-1 bg-dungeon-800 border border-dungeon-600 rounded text-xs text-slate-100 focus:outline-none focus:border-red-400 w-24"
            autoFocus
          />
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="min-h-[44px] px-3 py-1.5 rounded-full text-xs text-dungeon-500 border border-dashed border-dungeon-700 hover:text-slate-300 hover:border-dungeon-500 transition-all"
        >
          +
        </button>
      )}
    </div>
  );
}

// ─── Priority Picker ────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  "Urgent": "bg-red-500/20 text-red-300 border-red-500/40",
  "High": "bg-orange-500/20 text-orange-300 border-orange-500/40",
  "Medium": "bg-amber-500/20 text-amber-300 border-amber-500/40",
  "Low": "bg-dungeon-700 text-slate-300 border-dungeon-600",
};

export function InlinePriorityPicker({
  taskId,
  currentValue,
  options,
  onUpdated,
  onConfigAdded,
}: {
  taskId: string;
  currentValue: string;
  options: ConfigOption[];
  onUpdated: () => void;
  onConfigAdded?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  const handleSelect = async (id: string) => {
    if (id === currentValue || saving) return;
    setSaving(true);
    try {
      await patchTask(taskId, { priority_id: id });
      onUpdated();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await addConfigOption("task_priorities", newName.trim());
      setNewName("");
      setShowAdd(false);
      onConfigAdded?.();
    } catch { /* silent */ }
  };

  return (
    <div className={`flex flex-wrap gap-1.5 ${saving ? "opacity-60 pointer-events-none" : ""}`}>
      {options.map((opt) => {
        const colors = PRIORITY_COLORS[opt.name] || "bg-dungeon-700 text-slate-300 border-dungeon-600";
        return (
          <button
            key={opt.id}
            onClick={() => handleSelect(opt.id)}
            className={`min-h-[44px] px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${colors} ${
              opt.id === currentValue ? "ring-2 ring-red-400/60 border-transparent" : "hover:ring-1 hover:ring-dungeon-500"
            }`}
          >
            {opt.icon && <span className="mr-1">{opt.icon}</span>}
            {opt.name}
          </button>
        );
      })}
      {showAdd ? (
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAdd(false); }}
          placeholder="New priority..."
          className="min-h-[44px] px-2 py-1 bg-dungeon-800 border border-dungeon-600 rounded text-xs text-slate-100 focus:outline-none focus:border-red-400 w-24"
          autoFocus
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="min-h-[44px] px-3 py-1.5 rounded-full text-xs text-dungeon-500 border border-dashed border-dungeon-700 hover:text-slate-300 hover:border-dungeon-500 transition-all"
        >
          +
        </button>
      )}
    </div>
  );
}

// ─── Type Picker ────────────────────────────────────────────────────────

export function InlineTypePicker({
  taskId,
  currentValue,
  options,
  onUpdated,
  onConfigAdded,
}: {
  taskId: string;
  currentValue?: string;
  options: ConfigOption[];
  onUpdated: () => void;
  onConfigAdded?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  const handleSelect = async (id: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await patchTask(taskId, { task_type_id: id === currentValue ? null : id });
      onUpdated();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await addConfigOption("task_types", newName.trim());
      setNewName("");
      setShowAdd(false);
      onConfigAdded?.();
    } catch { /* silent */ }
  };

  return (
    <div className={`flex flex-wrap gap-1.5 ${saving ? "opacity-60 pointer-events-none" : ""}`}>
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => handleSelect(opt.id)}
          className={`min-h-[44px] px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            opt.id === currentValue
              ? "bg-red-500/20 text-red-300 ring-2 ring-red-400/60 border-transparent"
              : "bg-dungeon-700 text-slate-300 border-dungeon-600 hover:ring-1 hover:ring-dungeon-500"
          }`}
        >
          {opt.icon && <span className="mr-1">{opt.icon}</span>}
          {opt.name}
        </button>
      ))}
      {showAdd ? (
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAdd(false); }}
          placeholder="New type..."
          className="min-h-[44px] px-2 py-1 bg-dungeon-800 border border-dungeon-600 rounded text-xs text-slate-100 focus:outline-none focus:border-red-400 w-24"
          autoFocus
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="min-h-[44px] px-3 py-1.5 rounded-full text-xs text-dungeon-500 border border-dashed border-dungeon-700 hover:text-slate-300 hover:border-dungeon-500 transition-all"
        >
          +
        </button>
      )}
    </div>
  );
}

// ─── Effort Level Picker ─────────────────────────────────────────────────

export function InlineEffortPicker({
  taskId,
  currentValue,
  options,
  onUpdated,
  onConfigAdded,
}: {
  taskId: string;
  currentValue?: string;
  options: ConfigOption[];
  onUpdated: () => void;
  onConfigAdded?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  const handleSelect = async (id: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await patchTask(taskId, { effort_level_id: id === currentValue ? null : id });
      onUpdated();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await addConfigOption("effort_levels", newName.trim());
      setNewName("");
      setShowAdd(false);
      onConfigAdded?.();
    } catch { /* silent */ }
  };

  return (
    <div className={`flex flex-wrap gap-1.5 ${saving ? "opacity-60 pointer-events-none" : ""}`}>
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => handleSelect(opt.id)}
          className={`min-h-[44px] px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            opt.id === currentValue
              ? "bg-red-500/20 text-red-300 ring-2 ring-red-400/60 border-transparent"
              : "bg-dungeon-700 text-slate-300 border-dungeon-600 hover:ring-1 hover:ring-dungeon-500"
          }`}
        >
          {opt.icon && <span className="mr-1">{opt.icon}</span>}
          {opt.name}
        </button>
      ))}
      {showAdd ? (
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAdd(false); }}
          placeholder="New effort..."
          className="min-h-[44px] px-2 py-1 bg-dungeon-800 border border-dungeon-600 rounded text-xs text-slate-100 focus:outline-none focus:border-red-400 w-24"
          autoFocus
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="min-h-[44px] px-3 py-1.5 rounded-full text-xs text-dungeon-500 border border-dashed border-dungeon-700 hover:text-slate-300 hover:border-dungeon-500 transition-all"
        >
          +
        </button>
      )}
    </div>
  );
}

// ─── Date Picker ────────────────────────────────────────────────────────

export function InlineDatePicker({
  taskId,
  currentValue,
  onUpdated,
}: {
  taskId: string;
  currentValue?: string;
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (dateStr: string) => {
    setSaving(true);
    try {
      await patchTask(taskId, { due_date: dateStr || null });
      onUpdated();
    } catch { /* silent */ }
    setSaving(false);
  };

  return (
    <div className={saving ? "opacity-60 pointer-events-none" : ""}>
      <DatePicker
        value={currentValue || ""}
        onChange={handleChange}
        showRelative
      />
    </div>
  );
}

// ─── Assignee Picker ────────────────────────────────────────────────────

export function InlineAssigneePicker({
  taskId,
  currentValue,
  members,
  onUpdated,
}: {
  taskId: string;
  currentValue?: string;
  members: HouseholdMember[];
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (userId: string) => {
    setSaving(true);
    try {
      await patchTask(taskId, { assigned_to: userId || null });
      onUpdated();
    } catch { /* silent */ }
    setSaving(false);
  };

  return (
    <select
      value={currentValue || ""}
      onChange={(e) => handleChange(e.target.value)}
      disabled={saving}
      className="min-h-[44px] bg-dungeon-800 border border-dungeon-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-400 cursor-pointer disabled:opacity-50"
    >
      <option value="">Unassigned</option>
      {members.map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {m.user?.full_name || m.display_name || m.user_id}
        </option>
      ))}
    </select>
  );
}

// ─── Tag Editor ─────────────────────────────────────────────────────────

export function InlineTagEditor({
  taskId,
  currentTags,
  availableTags,
  onUpdated,
}: {
  taskId: string;
  currentTags: { id: string; tag_id: string; tag: { name: string; display_color?: string; icon?: string } }[];
  availableTags: ConfigOption[];
  onUpdated: () => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentTagIds = currentTags.map((t) => t.tag_id);
  const unselected = availableTags.filter((t) => !currentTagIds.includes(t.id));

  const handleAddTag = async (tagId: string) => {
    setSaving(true);
    try {
      await fetch(`/api/tasks/${taskId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_id: tagId }),
      });
      onUpdated();
    } catch { /* silent */ }
    setSaving(false);
    setShowDropdown(false);
  };

  const handleRemoveTag = async (assocId: string) => {
    setSaving(true);
    try {
      await fetch(`/api/tasks/${taskId}/tags/${assocId}`, { method: "DELETE" });
      onUpdated();
    } catch { /* silent */ }
    setSaving(false);
  };

  return (
    <div className={`flex flex-wrap gap-1.5 items-center ${saving ? "opacity-60" : ""}`}>
      {currentTags.map((tagAssoc) => (
        <span
          key={tagAssoc.id}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-dungeon-700"
          style={{
            color: tagAssoc.tag.display_color || undefined,
            borderColor: tagAssoc.tag.display_color || undefined,
            borderWidth: tagAssoc.tag.display_color ? "1px" : "0",
          }}
        >
          {tagAssoc.tag.icon && <span>{tagAssoc.tag.icon}</span>}
          {tagAssoc.tag.name}
          <button
            onClick={() => handleRemoveTag(tagAssoc.tag_id)}
            className="ml-0.5 text-dungeon-400 hover:text-red-400 transition-colors"
          >
            ×
          </button>
        </span>
      ))}
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="min-h-[32px] px-2 py-1 rounded-full text-xs text-dungeon-500 border border-dashed border-dungeon-700 hover:text-slate-300 hover:border-dungeon-500 transition-all"
        >
          + Tag
        </button>
        {showDropdown && unselected.length > 0 && (
          <div className="absolute top-full left-0 mt-1 z-20 bg-dungeon-800 border border-dungeon-700 rounded-lg shadow-xl py-1 min-w-[140px]">
            {unselected.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleAddTag(tag.id)}
                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-dungeon-700 transition-colors"
              >
                {tag.icon && <span className="mr-1">{tag.icon}</span>}
                {tag.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
