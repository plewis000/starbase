"use client";

import { useEffect, useState, useMemo } from "react";
import Modal from "./Modal";

interface Entity {
  id: string;
  title?: string;
  name?: string;
}

interface LinkPickerProps {
  entityType: "goal" | "habit" | "task";
  onSelect: (ids: string[]) => void;
  excludeIds?: string[];
  isOpen: boolean;
  onClose: () => void;
}

export default function LinkPicker({
  entityType,
  onSelect,
  excludeIds = [],
  isOpen,
  onClose,
}: LinkPickerProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiEndpoint = useMemo(() => {
    switch (entityType) {
      case "goal":
        return "/api/goals?status=active";
      case "habit":
        return "/api/habits?status=active";
      case "task":
        return "/api/tasks?status=active";
      default:
        return "";
    }
  }, [entityType]);

  const displayLabel = useMemo(() => {
    switch (entityType) {
      case "goal":
        return "Goals";
      case "habit":
        return "Habits";
      case "task":
        return "Tasks";
      default:
        return "Entities";
    }
  }, [entityType]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchEntities = async () => {
      try {
        setLoading(true);
        setError(null);
        setSelectedIds(new Set());

        const res = await fetch(apiEndpoint);
        if (!res.ok) {
          throw new Error(`Failed to fetch ${entityType}s`);
        }

        const data = await res.json();
        const items = Array.isArray(data) ? data : data[`${entityType}s`] || data[entityType] || [];

        // Filter out excluded IDs
        const filtered = items.filter((item: Entity) => !excludeIds.includes(item.id));
        setEntities(filtered);
      } catch {
        setError(`Failed to load ${displayLabel.toLowerCase()}`);
      } finally {
        setLoading(false);
      }
    };

    fetchEntities();
  }, [isOpen, apiEndpoint, excludeIds, entityType, displayLabel]);

  const filteredEntities = useMemo(() => {
    if (!searchQuery.trim()) return entities;

    const query = searchQuery.toLowerCase();
    return entities.filter((entity) => {
      const title = (entity.title || entity.name || "").toLowerCase();
      return title.includes(query);
    });
  }, [entities, searchQuery]);

  const handleToggle = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredEntities.length && filteredEntities.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEntities.map((e) => e.id)));
    }
  };

  const handleSubmit = () => {
    onSelect(Array.from(selectedIds));
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Link ${displayLabel}`}
      size="md"
    >
      <div className="space-y-4">
        {/* Search Bar */}
        <div>
          <input
            type="text"
            placeholder={`Search ${displayLabel.toLowerCase()}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>

        {/* Select All Checkbox */}
        {filteredEntities.length > 0 && (
          <div className="py-2 border-b border-slate-800">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredEntities.length && filteredEntities.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded accent-green-400 cursor-pointer"
              />
              <span className="text-sm text-slate-300">Select All</span>
            </label>
          </div>
        )}

        {/* Entity List */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="text-center py-4 text-slate-400 text-sm">
              Loading {displayLabel.toLowerCase()}...
            </div>
          ) : error ? (
            <div className="text-center py-4 text-red-400 text-sm">{error}</div>
          ) : filteredEntities.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-sm">
              No {displayLabel.toLowerCase()} found
            </div>
          ) : (
            filteredEntities.map((entity) => (
              <label
                key={entity.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(entity.id)}
                  onChange={() => handleToggle(entity.id)}
                  className="w-4 h-4 rounded accent-green-400 cursor-pointer"
                />
                <span className="text-sm text-slate-200">{entity.title || entity.name}</span>
              </label>
            ))
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/50 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedIds.size === 0}
            className="flex-1 px-4 py-2 rounded-lg bg-green-400 hover:bg-green-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 transition-colors text-sm font-medium"
          >
            Link Selected ({selectedIds.size})
          </button>
        </div>
      </div>
    </Modal>
  );
}
