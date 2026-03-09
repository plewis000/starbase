"use client";

import React, { useState, useEffect, useCallback } from "react";
import { EntityLink, LinkableEntityType, EntityLinkType } from "@/lib/types";
import LinkPicker from "./LinkPicker";

interface EntityLinksSectionProps {
  entityType: LinkableEntityType;
  entityId: string;
  onNavigate?: (type: LinkableEntityType, id: string) => void;
}

interface LinkedEntityDisplay {
  link: EntityLink;
  linkedType: LinkableEntityType;
  linkedId: string;
  direction: "outgoing" | "incoming";
  label: string;
  displayName?: string;
}

const LINK_TYPE_LABELS: Record<EntityLinkType, { outgoing: string; incoming: string }> = {
  derived_from: { outgoing: "Created from", incoming: "Spawned" },
  tracks: { outgoing: "Tracks", incoming: "Tracked by" },
  syncs_with: { outgoing: "Syncs with", incoming: "Syncs with" },
};

const ENTITY_TYPE_ICONS: Record<LinkableEntityType, string> = {
  task: "☐",
  goal: "◎",
  shopping_item: "🛒",
};

const ENTITY_TYPE_LABELS: Record<LinkableEntityType, string> = {
  task: "Task",
  goal: "Goal",
  shopping_item: "Shopping",
};

// Linkable target types per entity type (only types with searchable APIs for the picker)
const LINKABLE_PICKER_TYPES: Record<LinkableEntityType, Array<"task" | "goal">> = {
  task: ["goal"],
  goal: ["task"],
  shopping_item: ["task"],
};

export default function EntityLinksSection({
  entityType,
  entityId,
  onNavigate,
}: EntityLinksSectionProps) {
  const [links, setLinks] = useState<EntityLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityNames, setEntityNames] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetType, setPickerTargetType] = useState<"task" | "goal">("task");

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/entity-links?entity_type=${entityType}&entity_id=${entityId}`
      );
      if (res.ok) {
        const data = await res.json();
        setLinks(data.links || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  // Fetch display names for linked entities
  useEffect(() => {
    if (links.length === 0) return;

    const idsToFetch: { type: LinkableEntityType; id: string }[] = [];
    for (const link of links) {
      const isSource = link.source_type === entityType && link.source_id === entityId;
      const linkedType = isSource ? link.target_type : link.source_type;
      const linkedId = isSource ? link.target_id : link.source_id;
      const key = `${linkedType}:${linkedId}`;
      if (!entityNames[key]) {
        idsToFetch.push({ type: linkedType, id: linkedId });
      }
    }

    if (idsToFetch.length === 0) return;

    // Fetch names in parallel — best effort
    const fetchNames = async () => {
      const newNames: Record<string, string> = {};
      await Promise.allSettled(
        idsToFetch.map(async ({ type, id }) => {
          try {
            let url = "";
            if (type === "task") url = `/api/tasks/${id}`;
            else if (type === "goal") url = `/api/goals/${id}`;
            else return; // shopping_item has no individual fetch endpoint

            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              const entity = data.task || data.habit || data.goal;
              if (entity) {
                newNames[`${type}:${id}`] = entity.title || entity.name || id.slice(0, 8);
              }
            }
          } catch {
            // Best effort
          }
        })
      );

      if (Object.keys(newNames).length > 0) {
        setEntityNames((prev) => ({ ...prev, ...newNames }));
      }
    };

    fetchNames();
  }, [links, entityType, entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayLinks: LinkedEntityDisplay[] = links.map((link) => {
    const isSource = link.source_type === entityType && link.source_id === entityId;
    const linkedType = isSource ? link.target_type : link.source_type;
    const linkedId = isSource ? link.target_id : link.source_id;
    const direction = isSource ? "outgoing" : "incoming";
    const labels = LINK_TYPE_LABELS[link.link_type as EntityLinkType] || {
      outgoing: link.link_type,
      incoming: link.link_type,
    };
    const nameKey = `${linkedType}:${linkedId}`;

    return {
      link,
      linkedType,
      linkedId,
      direction,
      label: labels[direction],
      displayName: entityNames[nameKey],
    };
  });

  const handlePickerSelect = async (selectedIds: string[]) => {
    // Create entity links for each selected entity
    for (const targetId of selectedIds) {
      try {
        await fetch("/api/entity-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_type: entityType,
            source_id: entityId,
            target_type: pickerTargetType,
            target_id: targetId,
            link_type: "syncs_with",
            sync_completion: false,
          }),
        });
      } catch {
        // Skip individual failures
      }
    }
    await fetchLinks();
  };

  const handleRemoveLink = async (linkId: string) => {
    try {
      await fetch(`/api/entity-links?id=${linkId}`, { method: "DELETE" });
      await fetchLinks();
    } catch {
      // Silent fail
    }
  };

  const openPicker = (targetType: "task" | "goal") => {
    setPickerTargetType(targetType);
    setPickerOpen(true);
  };

  // Get IDs already linked for excluding from picker
  const linkedIds = links.map((l) => {
    const isSource = l.source_type === entityType && l.source_id === entityId;
    return isSource ? l.target_id : l.source_id;
  });

  if (loading) return null;

  const availableTypes = LINKABLE_PICKER_TYPES[entityType];

  if (links.length === 0) {
    return (
      <>
        <div className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-100">Linked Items</h3>
          </div>
          <p className="text-xs text-dungeon-500 mb-3">
            No linked items. Link to tasks, habits, or goals.
          </p>
          <div className="flex gap-2">
            {availableTypes.map((t) => (
              <button
                key={t}
                onClick={() => openPicker(t)}
                className="px-3 py-1.5 text-xs text-dungeon-400 hover:text-red-400 bg-dungeon-900 border border-dungeon-700 hover:border-red-400/30 rounded-lg transition-colors"
              >
                {ENTITY_TYPE_ICONS[t]} Link {ENTITY_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <LinkPicker
          entityType={pickerTargetType}
          onSelect={handlePickerSelect}
          excludeIds={linkedIds}
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <div className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Linked Items{" "}
            <span className="text-xs text-dungeon-400 font-normal">({links.length})</span>
          </h3>
          <div className="flex gap-1">
            {availableTypes.map((t) => (
              <button
                key={t}
                onClick={() => openPicker(t)}
                className="text-xs text-dungeon-500 hover:text-red-400 transition-colors px-1.5 py-0.5"
                title={`Link ${ENTITY_TYPE_LABELS[t]}`}
              >
                + {ENTITY_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {displayLinks.map(({ link, linkedType, linkedId, label, displayName }) => (
            <div
              key={link.id}
              className="flex items-center gap-2 p-2 bg-dungeon-900 rounded-lg border border-dungeon-800 group"
            >
              <span className="text-sm flex-shrink-0">
                {ENTITY_TYPE_ICONS[linkedType]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-dungeon-500">{label}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-dungeon-800 rounded text-dungeon-400">
                    {ENTITY_TYPE_LABELS[linkedType]}
                  </span>
                  {link.sync_completion && (
                    <span
                      className="text-xs text-amber-400"
                      title="Completion synced"
                    >
                      sync
                    </span>
                  )}
                </div>
                <p
                  className={`text-sm text-slate-300 truncate ${
                    onNavigate ? "cursor-pointer hover:text-red-400" : ""
                  }`}
                  onClick={() => onNavigate?.(linkedType, linkedId)}
                  title={displayName || linkedId}
                >
                  {displayName || `${linkedId.slice(0, 8)}...`}
                </p>
              </div>
              <button
                onClick={() => handleRemoveLink(link.id)}
                className="opacity-0 group-hover:opacity-100 text-dungeon-500 hover:text-red-400 transition-all p-1 flex-shrink-0"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
      <LinkPicker
        entityType={pickerTargetType}
        onSelect={handlePickerSelect}
        excludeIds={linkedIds}
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
