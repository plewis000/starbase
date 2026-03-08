"use client";

import React, { useState } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import DatePicker from "@/components/ui/DatePicker";
import { useToast } from "@/components/ui/Toast";
import { useTaskConfig } from "@/hooks/useTaskConfig";
import { Task, ChecklistItem } from "@/lib/types";
import { StatusPicker, PriorityPicker, TypePicker, EffortPicker, LocationPicker, OwnerPicker, TagPicker } from "./FieldPickers";
import RecurrenceEditor from "./RecurrenceEditor";

interface TaskFormProps {
  task?: Task;
  onSave: (task: Task) => void;
  onCancel: () => void;
}

const SECTION_LABEL = "block text-xs text-dungeon-400 font-semibold uppercase tracking-wider mb-2";

export default function TaskForm({ task, onSave, onCancel }: TaskFormProps) {
  const isEditing = !!task;
  const toast = useToast();
  const { config, loading: configLoading } = useTaskConfig();

  const [formData, setFormData] = useState({
    title: task?.title || "",
    description: task?.description || "",
    statusId: task?.status?.id || task?.status_id || "",
    priorityId: task?.priority?.id || task?.priority_id || "",
    dueDate: task?.due_date || new Date().toISOString().split("T")[0],
    recurrenceRule: task?.recurrence_rule || "",
    taskTypeId: task?.task_type_id || "",
    effortLevelId: task?.effort_level_id || "",
    locationContextId: task?.location_context_id || "",
    scheduleDate: task?.schedule_date || "",
    estimatedMinutes: task?.estimated_minutes || 0,
    completionMode: task?.completion_mode || "solo",
  });

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    task?.tags?.map((t) => t.tag_id) || []
  );

  const [selectedOwnerIds, setSelectedOwnerIds] = useState<string[]>(
    task?.owner_ids || (task?.assignee?.id ? [task.assignee.id] : [])
  );

  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(
    task?.checklist_items || []
  );
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const setField = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

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
        owner_ids: selectedOwnerIds,
        recurrence_rule: formData.recurrenceRule || null,
        task_type_id: formData.taskTypeId || null,
        effort_level_id: formData.effortLevelId || null,
        location_context_id: formData.locationContextId || null,
        schedule_date: formData.scheduleDate || null,
        estimated_minutes: formData.estimatedMinutes || null,
        tag_ids: selectedTagIds,
        checklist_items: checklistItems.filter((item) => item.title.trim()).map((item) => item.title.trim()),
        completion_mode: formData.completionMode || "solo",
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

  const members = config?.members || [];
  const statuses = config?.statuses || [];
  const priorities = config?.priorities || [];
  const taskTypes = config?.task_types || [];
  const effortLevels = config?.effort_levels || [];
  const locations = config?.locations || [];
  const tags = config?.tags || [];

  if (configLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 1. Title */}
      <div>
        <label className={SECTION_LABEL}>Title *</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="Enter task title..."
          disabled={submitting}
          autoFocus
          className="w-full bg-dungeon-800 border border-dungeon-700 rounded px-4 py-2 text-slate-100 placeholder-dungeon-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
        />
      </div>

      {/* 2. Status + Priority (side by side) */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={SECTION_LABEL}>Status</label>
          <StatusPicker
            options={statuses}
            value={formData.statusId}
            onChange={(id) => setField("statusId", id)}
            disabled={submitting}
          />
        </div>
        <div>
          <label className={SECTION_LABEL}>Priority</label>
          <PriorityPicker
            options={priorities}
            value={formData.priorityId}
            onChange={(id) => setField("priorityId", id)}
            disabled={submitting}
          />
        </div>
      </div>

      {/* 3. Type pills (if types exist) */}
      {taskTypes.length > 0 && (
        <div>
          <label className={SECTION_LABEL}>Type</label>
          <TypePicker
            options={taskTypes}
            value={formData.taskTypeId}
            onChange={(id) => setField("taskTypeId", id)}
            disabled={submitting}
          />
        </div>
      )}

      {/* 4. Effort pills (if effort levels exist) */}
      {effortLevels.length > 0 && (
        <div>
          <label className={SECTION_LABEL}>Effort</label>
          <EffortPicker
            options={effortLevels}
            value={formData.effortLevelId}
            onChange={(id) => setField("effortLevelId", id)}
            disabled={submitting}
          />
        </div>
      )}

      {/* 4b. Location pills (if locations exist) */}
      {locations.length > 0 && (
        <div>
          <label className={SECTION_LABEL}>Location</label>
          <LocationPicker
            options={locations}
            value={formData.locationContextId}
            onChange={(id) => setField("locationContextId", id)}
            disabled={submitting}
          />
        </div>
      )}

      {/* 5. Due Date + Start Date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={SECTION_LABEL}>Date</label>
          <DatePicker
            value={formData.dueDate}
            onChange={(d) => setField("dueDate", d)}
          />
        </div>
      </div>

      {/* 5b. Recurrence + Time Estimate */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={SECTION_LABEL}>Repeat</label>
          <RecurrenceEditor
            value={formData.recurrenceRule}
            onChange={(rule) => setField("recurrenceRule", rule)}
          />
        </div>
        <div>
          <label className={SECTION_LABEL}>Estimated Time (min)</label>
          <input
            type="number"
            min={0}
            max={10000}
            value={formData.estimatedMinutes || ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, estimatedMinutes: parseInt(e.target.value) || 0 }))}
            placeholder="e.g. 30"
            disabled={submitting}
            className="w-full bg-dungeon-800 border border-dungeon-700 rounded px-4 py-2 text-slate-100 placeholder-dungeon-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
          />
        </div>
      </div>

      {/* 6. Owners (multi-select) */}
      <div>
        <label className={SECTION_LABEL}>
          Owners
          {members.length > 1 && (
            <span className="text-xs text-dungeon-500 ml-2 font-normal normal-case tracking-normal">
              Everyone selected gets full XP on completion
            </span>
          )}
        </label>
        <OwnerPicker
          members={members}
          selectedIds={selectedOwnerIds}
          onChange={setSelectedOwnerIds}
          disabled={submitting}
        />
        {selectedOwnerIds.length === 0 && (
          <p className="text-xs text-dungeon-500 mt-1 italic">
            No owner — will be unassigned
          </p>
        )}
      </div>

      {/* 7. Completion Mode (only show when 2+ owners) */}
      {selectedOwnerIds.length > 1 && (
        <div>
          <label className={SECTION_LABEL}>Completion Mode</label>
          <div className="flex gap-2">
            {[
              { value: "solo", label: "Solo", desc: "One person completes, they get XP" },
              { value: "coop", label: "Co-op", desc: "Everyone gets full XP" },
              { value: "competitive", label: "Competitive", desc: "First to finish gets XP" },
            ].map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setField("completionMode", mode.value)}
                disabled={submitting}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50 ${
                  formData.completionMode === mode.value
                    ? "bg-red-400/20 border border-red-400/50 text-red-300"
                    : "bg-dungeon-800 border border-dungeon-700 text-dungeon-400 hover:border-dungeon-600"
                }`}
                title={mode.desc}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-dungeon-500 mt-1">
            {formData.completionMode === "solo" && "One person completes it and gets the XP"}
            {formData.completionMode === "coop" && "Everyone gets full XP when completed"}
            {formData.completionMode === "competitive" && "First to finish gets the XP"}
          </p>
        </div>
      )}

      {/* 8. Tags toggle pills */}
      {tags.length > 0 && (
        <div>
          <label className={SECTION_LABEL}>Tags</label>
          <TagPicker
            options={tags}
            selectedIds={selectedTagIds}
            onChange={setSelectedTagIds}
            disabled={submitting}
          />
        </div>
      )}

      {/* 9. Description */}
      <div>
        <label className={SECTION_LABEL}>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setField("description", e.target.value)}
          placeholder="Add a detailed description..."
          disabled={submitting}
          rows={3}
          className="w-full bg-dungeon-800 border border-dungeon-700 rounded px-4 py-2 text-slate-100 placeholder-dungeon-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50 resize-none"
        />
      </div>

      {/* 10. Checklist Items */}
      <div>
        <label className={SECTION_LABEL}>Checklist Items</label>
        <div className="space-y-2 mb-3">
          {checklistItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.checked}
                readOnly
                className="w-4 h-4 rounded border-dungeon-700 bg-dungeon-800 text-red-400 cursor-pointer"
              />
              <span className="flex-1 text-sm text-slate-100">{item.title}</span>
              <button
                type="button"
                onClick={() => handleRemoveChecklistItem(item.id)}
                disabled={submitting}
                className="text-dungeon-500 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newChecklistItem}
            onChange={(e) => setNewChecklistItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddChecklistItem();
              }
            }}
            placeholder="Add checklist item..."
            disabled={submitting}
            className="flex-1 bg-dungeon-800 border border-dungeon-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-dungeon-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleAddChecklistItem}
            disabled={submitting || !newChecklistItem.trim()}
            className="px-3 py-2 bg-dungeon-800 hover:bg-dungeon-700 disabled:opacity-50 text-slate-100 text-sm font-medium rounded transition-colors"
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

      {/* 11. Form actions */}
      <div className="flex gap-3 justify-end pt-4 border-t border-dungeon-800">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 bg-dungeon-800 hover:bg-dungeon-700 disabled:opacity-50 text-slate-100 font-medium rounded transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-red-400 hover:bg-red-500 disabled:bg-dungeon-700 disabled:cursor-not-allowed text-slate-950 font-medium rounded transition-colors flex items-center gap-2"
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
