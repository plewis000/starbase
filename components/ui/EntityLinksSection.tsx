"use client";

import React, { useState, useEffect, useCallback } from "react";
import { EntityLink, LinkableEntityType, EntityLinkType } from "@/lib/types";

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
}

const LINK_TYPE_LABELS: Record<EntityLinkType, { outgoing: string; incoming: string }> = {
  derived_from: { outgoing: "Created from", incoming: "Spawned" },
  tracks: { outgoing: "Tracks", incoming: "Tracked by" },
  syncs_with: { outgoing: "Syncs with", incoming: "Syncs with" },
};

const ENTITY_TYPE_ICONS: Record<LinkableEntityType, string> = {
  task: "☐",
  habit: "↻",
  goal: "◎",
  shopping_item: "🛒",
};

const ENTITY_TYPE_LABELS: Record<LinkableEntityType, string> = {
  task: "Task",
  habit: "Habit",
  goal: "Goal",
  shopping_item: "Shopping",
};

// Linkable target types per entity type
const LINKABLE_TARGETS: Record<LinkableEntityType, LinkableEntityType[]> = {
  task: ["shopping_item", "habit", "goal"],
  habit: ["task", "goal"],
  goal: ["task", "habit"],
  shopping_item: ["task"],
};

export default function EntityLinksSection({
  entityType,
  entityId,
  onNavigate,
}: EntityLinksSectionProps) {
  const [links, setLinks] = useState<EntityLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkTargetType, setLinkTargetType] = useState<LinkableEntityType | "">("");
  const [linkTargetId, setLinkTargetId] = useState("");
  const [linkType, setLinkType] = useState<EntityLinkType>("syncs_with");
  const [syncCompletion, setSyncCompletion] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

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
      // Silently fail — section just shows empty
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const displayLinks: LinkedEntityDisplay[] = links.map((link) => {
    const isSource = link.source_type === entityType && link.source_id === entityId;
    const linkedType = isSource ? link.target_type : link.source_type;
    const linkedId = isSource ? link.target_id : link.source_id;
    const direction = isSource ? "outgoing" : "incoming";
    const labels = LINK_TYPE_LABELS[link.link_type as EntityLinkType] || {
      outgoing: link.link_type,
      incoming: link.link_type,
    };

    return {
      link,
      linkedType,
      linkedId,
      direction,
      label: labels[direction],
    };
  });

  const handleCreateLink = async () => {
    if (!linkTargetType || !linkTargetId.trim()) return;
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/entity-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: entityType,
          source_id: entityId,
          target_type: linkTargetType,
          target_id: linkTargetId.trim(),
          link_type: linkType,
          sync_completion: syncCompletion,
        }),
      });

      if (res.status === 409) {
        setError("Link already exists");
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create link");
        return;
      }

      setShowLinkForm(false);
      setLinkTargetType("");
      setLinkTargetId("");
      setLinkType("syncs_with");
      setSyncCompletion(false);
      await fetchLinks();
    } catch {
      setError("Failed to create link");
    } finally {
      setCreating(false);
    }
  };

  const handleRemoveLink = async (linkId: string) => {
    try {
      await fetch(`/api/entity-links?id=${linkId}`, { method: "DELETE" });
      await fetchLinks();
    } catch {
      // Silent fail
    }
  };

  if (loading) return null; // Don't show skeleton for this section
  if (links.length === 0 && !showLinkForm) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Linked Items</h3>
          <button
            onClick={() => setShowLinkForm(true)}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors"
          >
            + Add Link
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          No linked items. Link to tasks, habits, goals, or shopping items.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-100">
          Linked Items{" "}
          {links.length > 0 && (
            <span className="text-xs text-slate-400 font-normal">({links.length})</span>
          )}
        </h3>
        {!showLinkForm && (
          <button
            onClick={() => setShowLinkForm(true)}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors"
          >
            + Add Link
          </button>
        )}
      </div>

      {/* Existing links */}
      {displayLinks.length > 0 && (
        <div className="space-y-2 mb-3">
          {displayLinks.map(({ link, linkedType, linkedId, label }) => (
            <div
              key={link.id}
              className="flex items-center gap-2 p-2 bg-slate-900 rounded-lg border border-slate-800 group"
            >
              <span className="text-sm flex-shrink-0">
                {ENTITY_TYPE_ICONS[linkedType]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{label}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">
                    {ENTITY_TYPE_LABELS[linkedType]}
                  </span>
                </div>
                <p
                  className={`text-sm text-slate-300 truncate ${
                    onNavigate ? "cursor-pointer hover:text-red-400" : ""
                  }`}
                  onClick={() => onNavigate?.(linkedType, linkedId)}
                  title={linkedId}
                >
                  {linkedId.slice(0, 8)}...
                </p>
              </div>
              {link.sync_completion && (
                <span
                  className="text-xs text-amber-400 flex-shrink-0"
                  title="Completion synced"
                >
                  ⚡
                </span>
              )}
              <button
                onClick={() => handleRemoveLink(link.id)}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1 flex-shrink-0"
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
      )}

      {/* Add link form */}
      {showLinkForm && (
        <div className="bg-slate-900 rounded-lg p-3 space-y-3 border border-slate-700">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Target Type</label>
              <select
                value={linkTargetType}
                onChange={(e) => setLinkTargetType(e.target.value as LinkableEntityType)}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-100 focus:outline-none focus:border-red-400"
              >
                <option value="">Select...</option>
                {LINKABLE_TARGETS[entityType].map((t) => (
                  <option key={t} value={t}>
                    {ENTITY_TYPE_ICONS[t]} {ENTITY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Link Type</label>
              <select
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as EntityLinkType)}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-100 focus:outline-none focus:border-red-400"
              >
                <option value="syncs_with">Syncs with</option>
                <option value="derived_from">Derived from</option>
                <option value="tracks">Tracks</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Target ID</label>
            <input
              type="text"
              value={linkTargetId}
              onChange={(e) => setLinkTargetId(e.target.value)}
              placeholder="Paste entity UUID..."
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sync-completion"
              checked={syncCompletion}
              onChange={(e) => setSyncCompletion(e.target.checked)}
              className="rounded accent-red-400"
            />
            <label htmlFor="sync-completion" className="text-xs text-slate-400">
              Sync completion (completing one completes the other)
            </label>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowLinkForm(false);
                setError("");
              }}
              className="flex-1 px-3 py-1.5 text-slate-400 hover:text-slate-100 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateLink}
              disabled={creating || !linkTargetType || !linkTargetId.trim()}
              className="flex-1 px-3 py-1.5 bg-red-400 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 font-medium rounded text-sm transition-colors"
            >
              {creating ? "Linking..." : "Link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
