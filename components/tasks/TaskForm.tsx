"use client";

import React, { useState, useEffect } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { Task, ChecklistItem, UserSummary } from "@/lib/types";

interface TaskFormProps {
  task?: Task;
  onSave: (task: Task) => void;
  onCancel: () => void;
}

interface ConfigOption {
  id: string;
  name: string;
  slug?: string;
  color?: string;
  sort_order?: number;
}

interface HouseholdMember {
  user_id: string;
  display_name?: string;
  user?: UserSummary | null;
}

const RECURRENCE_PRESETS = [
  { label: "None", value: "" },
  { label: "Daily", value: "FREQ=DAILY;INTERVAL=1" },
  { label: "Every weekday", value: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR" },
  { label: "Weekly", value: "FREQ=WEEKLY;INTERVAL=1" },
  { label: "Biweekly", value: "FREQ=WEEKLY;INTERVAL=2" },
  { label: "Monthly", value: "FREQ=MONTHLY;INTERVAL=1" },
  { label: "Quarterly", value: "FREQ=MONTHLY;INTERVAL=3" },
];

function describeRRule(rule: string): string {
  if (!rule) return "None";
  const preset = RECURRENCE_PRESETS.find((p) => p.value === rule);
  if (preset) return preset.label;
  // Fallback: parse basic RRULE
  const parts = Object.fromEntries(rule.split(";").map((p) => p.split("=")));
  const freq = parts.FREQ?.toLowerCase() || "custom";
  const interval = parts.INTERVAL ? parseInt(parts.INTERVAL) : 1;
  if (interval === 1) return `Every ${freq.replace("ly", "")}`;
  return `Every ${interval} ${freq.replace("ly", "")}s`;
}

export default function TaskForm({
  task,
  onSave,
  onCancel,
}: TaskFormProps) {
  const isEditing = !!task;
  const toast = useToast();

  // Fetch config options from API (real UUIDs, not hardcoded slugs)
  const [statuses, setStatuses] = useState<ConfigOption[]>([]);
  const [priorities, setPriorities] = useState<ConfigOption[]>([]);
  const [configLoading, setConfigLoading] = useState(true);

  // Household members for owner selection
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = await res.json();
          setStatuses(data.statuses || []);
          setPriorities(data.priorities || []);
        }
      } catch {
        toast.error("Failed to load task options");
      } finally {
        setConfigLoading(false);
      }
    }
    async function fetchMembers() {
      try {
        const res = await fetch("/api/household/members");
        if (res.ok) {
          const data = await res.json();
          setHouseholdMembers(data.members || []);
        }
      } catch {
        // Non-critical — owner selection will be unavailable
      } finally {
        setMembersLoading(false);
      }
    }
    fetchConfig();
    fetchMembers();
  }, []);

  const [formData, setFormData] = useState({
    title: task?.title || "",
    description: task?.description || "",
    statusId: task?.status?.id || task?.status_id || "",
    priorityId: task?.priority?.id || task?.priority_id || "",
    dueDate: task?.due_date || "",
    assignedTo: task?.assignee?.id || "",
    recurrenceRule: task?.recurrence_rule || "",
  });

  // Additional owners (multi-select)
  const [selectedOwners, setSelectedOwners] = useState<string[]>(
    task?.additional_owners?.map((o) => o.id) || []
  );

  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(
    task?.checklist_items || []
  );
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleToggleOwner = (userId: string) => {
    setSelectedOwners((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleAddChecklistItem = () => {
    if (!newChecklistItem.trim()) return;

    const newItem: ChecklistItem = {
      id: `temp-${Date.now()}`,
      title: newChecklistItem.trim(),
      checked: false,
      sort_order: checklistItems.length,
    };

    setChecklistItems((prev) => [...prev, newItem]);
    setNewChecklistItem("");
  };

  const handleRemoveChecklistItem = (itemId: string) => {
    setChecklistItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (!formData.title.trim()) {
      setError("Task title is required");
      setSubmitting(false);
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        status_id: formData.statusId || null,
        priority_id: formData.priorityId || null,
        due_date: formData.dueDate || null,
        assigned_to: formData.assignedTo || null,
        recurrence_rule: formData.recurrenceRule || null,
        additional_owners: selectedOwners,
        checklist_items: checklistItems.filter((item) => item.title.trim()).map((item) => item.title.trim()),
      };

      const method = isEditing ? "PATCH" : "POST";
      const url = isEditing ? `/api/tasks/${task.id}` : "/api/tasks";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save task");
      }

      const data = await response.json();
      onSave(data.task);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-slate-100 mb-2">
          Task Title *
        </label>
        <input
          type="text"
          name="title"
          value={formData.title}
          onChange={handleInputChange}
          placeholder="Enter task title..."
          disabled={submitting}
          className="w-full bg-slate-800 border border-slate-700 rounded px-4 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-100 mb-2">
          Description
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          placeholder="Add a detailed description..."
          disabled={submitting}
          rows={4}
          className="w-full bg-slate-800 border border-slate-700 rounded px-4 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50 resize-none"
        />
      </div>

      {/* Status and Priority row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-slate-100 mb-2">
            Status
          </label>
          <select
            name="statusId"
            value={formData.statusId}
            onChange={handleInputChange}
            disabled={submitting || configLoading}
            className="w-full bg-slate-800 border border-slate-700 rounded px-4 py-2 text-slate-100 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
          >
            <option value="">{configLoading ? "Loading..." : "Select status..."}</option>
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium text-slate-100 mb-2">
            Priority
          </label>
          <select
            name="priorityId"
            value={formData.priorityId}
            onChange={handleInputChange}
            disabled={submitting || configLoading}
            className="w-full bg-slate-800 border border-slate-700 rounded px-4 py-2 text-slate-100 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
          >
            <option value="">{configLoading ? "Loading..." : "Select priority..."}</option>
            {priorities.map((priority) => (
              <option key={priority.id} value={priority.id}>
                {priority.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Due Date and Recurrence row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Due Date */}
        <div>
          <label className="block text-sm font-medium text-slate-100 mb-2">
            Due Date
          </label>
          <input
            type="date"
            name="dueDate"
            value={formData.dueDate}
            onChange={handleInputChange}
            disabled={submitting}
            className="w-full bg-slate-800 border border-slate-700 rounded px-4 py-2 text-slate-100 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
          />
        </div>

        {/* Recurrence */}
        <div>
          <label className="block text-sm font-medium text-slate-100 mb-2">
            Repeat
          </label>
          <select
            name="recurrenceRule"
            value={formData.recurrenceRule}
            onChange={handleInputChange}
            disabled={submitting}
            className="w-full bg-slate-800 border border-slate-700 rounded px-4 py-2 text-slate-100 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
          >
            {RECURRENCE_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          {formData.recurrenceRule && !RECURRENCE_PRESETS.find((p) => p.value === formData.recurrenceRule) && (
            <p className="text-xs text-slate-400 mt-1">
              Custom: {describeRRule(formData.recurrenceRule)}
            </p>
          )}
        </div>
      </div>

      {/* Assigned To */}
      <div>
        <label className="block text-sm font-medium text-slate-100 mb-2">
          Assigned To
        </label>
        <select
          name="assignedTo"
          value={formData.assignedTo}
          onChange={handleInputChange}
          disabled={submitting || membersLoading}
          className="w-full bg-slate-800 border border-slate-700 rounded px-4 py-2 text-slate-100 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
        >
          <option value="">{membersLoading ? "Loading..." : "Unassigned"}</option>
          {householdMembers.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name || m.user?.full_name || m.user_id}
            </option>
          ))}
        </select>
      </div>

      {/* Additional Owners (co-owners) */}
      {householdMembers.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-slate-100 mb-2">
            Co-owners
            <span className="text-xs text-slate-400 ml-2 font-normal">
              XP splits across all owners
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            {householdMembers
              .filter((m) => m.user_id !== formData.assignedTo)
              .map((m) => {
                const isSelected = selectedOwners.includes(m.user_id);
                const name = m.display_name || m.user?.full_name || "Member";
                return (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => handleToggleOwner(m.user_id)}
                    disabled={submitting}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-50 ${
                      isSelected
                        ? "bg-red-400/20 text-red-300 border border-red-400/50"
                        : "bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    {isSelected ? "- " : "+ "}
                    {name}
                  </button>
                );
              })}
          </div>
          {selectedOwners.length > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              {selectedOwners.length} co-owner{selectedOwners.length !== 1 ? "s" : ""} selected
            </p>
          )}
        </div>
      )}

      {/* Checklist Items */}
      <div>
        <label className="block text-sm font-medium text-slate-100 mb-2">
          Checklist Items
        </label>
        <div className="space-y-2 mb-3">
          {checklistItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.checked}
                disabled={submitting}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-red-400 cursor-pointer disabled:opacity-50"
              />
              <span className="flex-1 text-sm text-slate-100">{item.title}</span>
              <button
                type="button"
                onClick={() => handleRemoveChecklistItem(item.id)}
                disabled={submitting}
                className="text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Add checklist item */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newChecklistItem}
            onChange={(e) => setNewChecklistItem(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddChecklistItem();
              }
            }}
            placeholder="Add checklist item..."
            disabled={submitting}
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleAddChecklistItem}
            disabled={submitting || !newChecklistItem.trim()}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 text-sm font-medium rounded transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Form actions */}
      <div className="flex gap-3 justify-end pt-4 border-t border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 font-medium rounded transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-red-400 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 font-medium rounded transition-colors flex items-center gap-2"
        >
          {submitting ? (
            <>
              <LoadingSpinner size="sm" />
              Saving...
            </>
          ) : (
            `${isEditing ? "Update" : "Create"} Task`
          )}
        </button>
      </div>
    </form>
  );
}
