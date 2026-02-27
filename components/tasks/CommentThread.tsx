"use client";

import React, { useState, useRef, useEffect } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { Comment } from "@/lib/types";

interface CommentThreadProps {
  taskId: string;
  comments: Comment[];
  onCommentAdded: () => void;
}

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const getInitials = (fullName?: string): string => {
  if (!fullName) return "?";
  return fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

export default function CommentThread({
  taskId,
  comments: initialComments,
  onCommentAdded,
}: CommentThreadProps) {
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const threadsEndRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const scrollToBottom = () => {
    threadsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [comments]);

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newComment.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to add comment");
      }

      const data = await response.json();
      setComments((prev) => [...prev, data.comment]);
      setNewComment("");
      onCommentAdded();
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Comments list */}
      {comments.length > 0 ? (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              {/* Avatar */}
              <div className="flex-shrink-0">
                {comment.user?.avatar_url ? (
                  <img
                    src={comment.user.avatar_url}
                    alt={comment.user?.full_name || "User"}
                    className="w-8 h-8 rounded-full bg-slate-800 object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200">
                    {getInitials(comment.user?.full_name)}
                  </div>
                )}
              </div>

              {/* Comment content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-slate-100">
                    {comment.user?.full_name || "Unknown User"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatRelativeTime(comment.created_at)}
                  </span>
                </div>
                <p className="text-sm text-slate-300 break-words">
                  {comment.body}
                </p>
              </div>
            </div>
          ))}
          <div ref={threadsEndRef} />
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-4">
          No comments yet. Start a discussion!
        </p>
      )}

      {/* Add comment form */}
      <div className="pt-3 border-t border-slate-800 space-y-2">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey) {
              handleSubmitComment();
            }
          }}
          placeholder="Add a comment... (Ctrl+Enter to submit)"
          disabled={submitting}
          rows={3}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50 resize-none"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setNewComment("")}
            disabled={submitting || !newComment.trim()}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 text-sm font-medium rounded transition-colors"
          >
            Clear
          </button>
          <button
            onClick={handleSubmitComment}
            disabled={submitting || !newComment.trim()}
            className="px-3 py-2 bg-red-400 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 text-sm font-medium rounded transition-colors flex items-center gap-2"
          >
            {submitting ? <LoadingSpinner size="sm" /> : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
