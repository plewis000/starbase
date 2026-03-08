"use client";

import React from "react";
import Link from "next/link";
import CommentThread from "@/components/ui/CommentThread";

interface Thread {
  id: string;
  title: string;
  entity_type?: string;
  entity_id?: string;
  created_at: string;
}

interface ThreadDetailProps {
  thread: Thread;
  onClose: () => void;
}

const ENTITY_ROUTES: Record<string, string> = {
  task: "/tasks",
  goal: "/goals",
  habit: "/habits",
};

const ENTITY_ICONS: Record<string, string> = {
  task: "📋",
  goal: "🎯",
  habit: "🔄",
};

export default function ThreadDetail({ thread, onClose }: ThreadDetailProps) {
  const entityRoute = thread.entity_type ? ENTITY_ROUTES[thread.entity_type] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-dungeon-800">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-100 truncate">{thread.title}</h2>
          {thread.entity_type && thread.entity_id && (
            <div className="mt-1">
              {entityRoute ? (
                <Link
                  href={`${entityRoute}?highlight=${thread.entity_id}`}
                  className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <span>{ENTITY_ICONS[thread.entity_type] || "🔗"}</span>
                  <span>Linked {thread.entity_type}</span>
                  <span className="text-dungeon-500">→</span>
                </Link>
              ) : (
                <span className="text-xs text-dungeon-500">
                  🔗 Linked to {thread.entity_type}
                </span>
              )}
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-dungeon-400 hover:text-slate-100 transition-colors p-1 ml-2">
          ✕
        </button>
      </div>

      {/* Comment thread (reuses existing polymorphic system) */}
      <div className="flex-1 overflow-y-auto p-4">
        <CommentThread entityType="thread" entityId={thread.id} />
      </div>
    </div>
  );
}
