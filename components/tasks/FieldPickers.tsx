"use client";

import React from "react";
import { ConfigOption, HouseholdMember } from "@/hooks/useTaskConfig";

// ─── Color Maps (duplicated from InlineFieldEditors to avoid coupling) ──

const STATUS_COLORS: Record<string, string> = {
  "To Do": "bg-dungeon-600 text-slate-100",
  "In Progress": "bg-blue-500/20 text-blue-300 border-blue-500/40",
  "Blocked": "bg-red-500/20 text-red-300 border-red-500/40",
  "Done": "bg-green-500/20 text-green-300 border-green-500/40",
  "Someday": "bg-purple-500/20 text-purple-300 border-purple-500/40",
};

const PRIORITY_COLORS: Record<string, string> = {
  "Urgent": "bg-red-500/20 text-red-300 border-red-500/40",
  "High": "bg-orange-500/20 text-orange-300 border-orange-500/40",
  "Medium": "bg-amber-500/20 text-amber-300 border-amber-500/40",
  "Low": "bg-dungeon-700 text-slate-300 border-dungeon-600",
};

// ─── Generic PillPicker ──────────────────────────────────────────────────

interface PillPickerProps {
  options: ConfigOption[];
  value: string;
  onChange: (id: string) => void;
  colorMap?: Record<string, string>;
  allowDeselect?: boolean;
  disabled?: boolean;
}

function PillPicker({ options, value, onChange, colorMap, allowDeselect = false, disabled }: PillPickerProps) {
  const handleClick = (id: string) => {
    if (disabled) return;
    if (allowDeselect && id === value) {
      onChange("");
    } else {
      onChange(id);
    }
  };

  return (
    <div className={`flex flex-wrap gap-1.5 ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      {options.map((opt) => {
        const colors = colorMap?.[opt.name] || "bg-dungeon-700 text-slate-300 border-dungeon-600";
        const isSelected = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleClick(opt.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${colors} ${
              isSelected
                ? "ring-2 ring-red-400/60 border-transparent"
                : "border-transparent hover:ring-1 hover:ring-dungeon-500"
            }`}
          >
            {opt.icon && <span className="mr-1">{opt.icon}</span>}
            {opt.name}
          </button>
        );
      })}
    </div>
  );
}

// ─── Status Picker ───────────────────────────────────────────────────────

export function StatusPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: ConfigOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return <PillPicker options={options} value={value} onChange={onChange} colorMap={STATUS_COLORS} disabled={disabled} />;
}

// ─── Priority Picker ─────────────────────────────────────────────────────

export function PriorityPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: ConfigOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return <PillPicker options={options} value={value} onChange={onChange} colorMap={PRIORITY_COLORS} disabled={disabled} />;
}

// ─── Type Picker (toggle-off: click selected = deselect) ─────────────────

export function TypePicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: ConfigOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return <PillPicker options={options} value={value} onChange={onChange} allowDeselect disabled={disabled} />;
}

// ─── Effort Picker ───────────────────────────────────────────────────────

export function EffortPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: ConfigOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return <PillPicker options={options} value={value} onChange={onChange} allowDeselect disabled={disabled} />;
}

// ─── Assignee Picker ─────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AssigneePicker({
  members,
  value,
  onChange,
  disabled,
}: {
  members: HouseholdMember[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      {/* Unassigned option */}
      <button
        type="button"
        onClick={() => onChange("")}
        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
          !value
            ? "bg-dungeon-600 text-slate-100 ring-2 ring-red-400/60 border-transparent"
            : "bg-dungeon-700 text-dungeon-400 border-dungeon-600 hover:ring-1 hover:ring-dungeon-500"
        }`}
      >
        Unassigned
      </button>
      {members.map((m) => {
        const name = m.user?.full_name || m.display_name || "Member";
        const isSelected = m.user_id === value;
        return (
          <button
            key={m.user_id}
            type="button"
            onClick={() => onChange(m.user_id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              isSelected
                ? "bg-blue-500/20 text-blue-300 ring-2 ring-red-400/60 border-transparent"
                : "bg-dungeon-700 text-slate-300 border-dungeon-600 hover:ring-1 hover:ring-dungeon-500"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-dungeon-600 text-[9px] font-bold flex items-center justify-center text-slate-300">
              {getInitials(name)}
            </span>
            {name}
          </button>
        );
      })}
    </div>
  );
}

// ─── Owner Picker (multi-select pill toggles) ────────────────────────────

export function OwnerPicker({
  members,
  selectedIds,
  onChange,
  disabled,
}: {
  members: HouseholdMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (userId: string) => {
    if (disabled) return;
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
    }
  };

  return (
    <div className={`flex flex-wrap gap-1.5 ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      {members.map((m) => {
        const name = m.user?.full_name || m.display_name || "Member";
        const isSelected = selectedIds.includes(m.user_id);
        return (
          <button
            key={m.user_id}
            type="button"
            onClick={() => toggle(m.user_id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              isSelected
                ? "bg-red-400/20 text-red-300 ring-2 ring-red-400/60 border-transparent"
                : "bg-dungeon-700 text-slate-300 border-dungeon-600 hover:ring-1 hover:ring-dungeon-500"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-dungeon-600 text-[9px] font-bold flex items-center justify-center text-slate-300">
              {getInitials(name)}
            </span>
            {isSelected ? "- " : "+ "}{name}
          </button>
        );
      })}
      {members.length === 0 && (
        <span className="text-xs text-dungeon-500 italic">No members available</span>
      )}
    </div>
  );
}

// ─── Tag Picker (multi-select toggle) ────────────────────────────────────

export function TagPicker({
  options,
  selectedIds,
  onChange,
  disabled,
}: {
  options: ConfigOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (id: string) => {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((t) => t !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className={`flex flex-wrap gap-1.5 ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      {options.map((tag) => {
        const isSelected = selectedIds.includes(tag.id);
        const tagColor = tag.display_color;
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              isSelected
                ? "ring-2 ring-red-400/60 border-transparent"
                : "border-dungeon-600 hover:ring-1 hover:ring-dungeon-500"
            } ${isSelected ? "bg-dungeon-600" : "bg-dungeon-700"}`}
            style={tagColor ? {
              color: tagColor,
              borderColor: isSelected ? undefined : tagColor + "66",
              backgroundColor: isSelected ? tagColor + "30" : undefined,
            } : undefined}
          >
            {tag.icon && <span className="mr-1">{tag.icon}</span>}
            {tag.name}
          </button>
        );
      })}
      {options.length === 0 && (
        <span className="text-xs text-dungeon-500 italic">No tags available</span>
      )}
    </div>
  );
}
