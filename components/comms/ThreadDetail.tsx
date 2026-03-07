"use client";

import React from "react";
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

export default function ThreadDetail({ thread, onClose }: ThreadDetailProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-dungeon-800">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-100 truncate">{thread.title}</h2>
          {thread.entity_type && (
            <p className="text-xs text-dungeon-500 mt-0.5">
              Linked to {thread.entity_type} {thread.entity_id?.slice(0, 8)}...
            </p>
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
