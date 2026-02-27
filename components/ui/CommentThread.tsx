"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { CommentV2, CommentEntityType } from "@/lib/types";

interface CommentThreadProps {
  entityType: CommentEntityType;
  entityId: string;
  onCommentCountChange?: (count: number) => void;
}

const QUICK_REACTIONS = ["👍", "❤️", "😄", "🎯", "🔥", "👀"];

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

const getInitials = (name?: string): string => {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

function Avatar({ name, url, size = "sm" }: { name?: string; url?: string | null; size?: "sm" | "md" }) {
  const sizeClass = size === "md" ? "w-9 h-9" : "w-7 h-7";
  const textClass = size === "md" ? "text-xs" : "text-[10px]";

  if (url) {
    return (
      <img src={url} alt={name || "User"} className={`${sizeClass} rounded-full bg-slate-800 object-cover flex-shrink-0`} />
    );
  }
  return (
    <div className={`${sizeClass} rounded-full bg-slate-700 flex items-center justify-center ${textClass} font-semibold text-slate-200 flex-shrink-0`}>
      {getInitials(name)}
    </div>
  );
}

function ReactionBar({
  reactions,
  commentId,
  entityType,
  entityId,
  onReactionToggle,
}: {
  reactions: Record<string, number>;
  commentId: string;
  entityType: string;
  entityId: string;
  onReactionToggle: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  const toggleReaction = async (emoji: string) => {
    try {
      await fetch(`/api/comments/${entityType}/${entityId}/${commentId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      onReactionToggle();
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    }
    setShowPicker(false);
  };

  const reactionEntries = Object.entries(reactions).filter(([, count]) => count > 0);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {reactionEntries.map(([emoji, count]) => (
        <button
          key={emoji}
          onClick={() => toggleReaction(emoji)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs transition-colors"
        >
          <span>{emoji}</span>
          <span className="text-slate-400">{count}</span>
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs flex items-center justify-center text-slate-400 transition-colors"
          title="Add reaction"
        >
          +
        </button>
        {showPicker && (
          <div className="absolute left-0 bottom-full mb-1 bg-slate-800 border border-slate-700 rounded-lg p-1.5 flex gap-1 z-20 shadow-lg">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => toggleReaction(emoji)}
                className="w-7 h-7 rounded hover:bg-slate-700 flex items-center justify-center text-sm transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SingleComment({
  comment,
  entityType,
  entityId,
  isReply,
  currentUserId,
  onReply,
  onRefresh,
}: {
  comment: CommentV2;
  entityType: string;
  entityId: string;
  isReply?: boolean;
  currentUserId: string | null;
  onReply: (parentId: string) => void;
  onRefresh: () => void;
}) {
  const isOwnComment = currentUserId === comment.user_id;
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [showActions, setShowActions] = useState(false);

  const handleEdit = async () => {
    if (!editBody.trim() || editBody.trim() === comment.body) {
      setEditing(false);
      return;
    }
    try {
      const res = await fetch(`/api/comments/${entityType}/${entityId}/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      if (res.ok) {
        onRefresh();
        setEditing(false);
      }
    } catch (err) {
      console.error("Failed to edit comment:", err);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/comments/${entityType}/${entityId}/${comment.id}`, {
        method: "DELETE",
      });
      if (res.ok) onRefresh();
    } catch (err) {
      console.error("Failed to delete comment:", err);
    }
  };

  const authorName = comment.author?.full_name || "Unknown User";

  return (
    <div
      className={`flex gap-2.5 ${isReply ? "ml-9" : ""}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <Avatar
        name={authorName}
        url={comment.author?.avatar_url}
        size={isReply ? "sm" : "md"}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-slate-100">{authorName}</span>
          <span className="text-xs text-slate-500">{formatRelativeTime(comment.created_at)}</span>
          {comment.is_edited && <span className="text-xs text-slate-600">(edited)</span>}
          {comment.is_pinned && <span className="text-xs text-amber-400">pinned</span>}
        </div>

        {editing ? (
          <div className="space-y-2">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={2}
              className="w-full bg-slate-800 border border-green-400/50 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleEdit}
                className="px-3 py-1 bg-green-400 hover:bg-green-500 text-slate-950 text-xs font-medium rounded transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => { setEditing(false); setEditBody(comment.body); }}
                className="px-3 py-1 text-slate-400 hover:text-slate-100 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-300 break-words whitespace-pre-wrap">{comment.body}</p>

            {/* Reactions */}
            {(comment.reactions && Object.keys(comment.reactions).length > 0) && (
              <div className="mt-1.5">
                <ReactionBar
                  reactions={comment.reactions}
                  commentId={comment.id}
                  entityType={entityType}
                  entityId={entityId}
                  onReactionToggle={onRefresh}
                />
              </div>
            )}

            {/* Action buttons */}
            <div className={`flex items-center gap-3 mt-1 ${showActions ? "opacity-100" : "opacity-0"} transition-opacity`}>
              {!isReply && (
                <button
                  onClick={() => onReply(comment.id)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Reply
                </button>
              )}
              {isOwnComment && (
                <button
                  onClick={() => { setEditing(true); setEditBody(comment.body); }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Edit
                </button>
              )}
              {isOwnComment && (
                <button
                  onClick={handleDelete}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              )}
              {!(comment.reactions && Object.keys(comment.reactions).length > 0) && (
                <ReactionBar
                  reactions={{}}
                  commentId={comment.id}
                  entityType={entityType}
                  entityId={entityId}
                  onReactionToggle={onRefresh}
                />
              )}
            </div>
          </>
        )}

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 space-y-3">
            {comment.replies.map((reply) => (
              <SingleComment
                key={reply.id}
                comment={reply}
                entityType={entityType}
                entityId={entityId}
                isReply
                currentUserId={currentUserId}
                onReply={onReply}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommentThread({
  entityType,
  entityId,
  onCommentCountChange,
}: CommentThreadProps) {
  const [comments, setComments] = useState<CommentV2[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch current user ID for ownership checks
  useEffect(() => {
    fetch("/api/user")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.user?.id) setCurrentUserId(data.user.id); })
      .catch(() => {});
  }, []);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments/${entityType}/${entityId}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      const data = await res.json();
      const fetched = data.comments || [];
      setComments(fetched);
      // Count: top-level + all replies
      const total = fetched.reduce((sum: number, c: CommentV2) => sum + 1 + (c.replies?.length || 0), 0);
      onCommentCountChange?.(total);
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { body: newComment.trim() };
      if (replyingTo) body.parent_id = replyingTo;

      const res = await fetch(`/api/comments/${entityType}/${entityId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to post comment");

      setNewComment("");
      setReplyingTo(null);
      await fetchComments();
    } catch (err) {
      console.error("Error posting comment:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = (parentId: string) => {
    setReplyingTo(parentId);
    inputRef.current?.focus();
  };

  const replyingToComment = replyingTo
    ? comments.find((c) => c.id === replyingTo)
    : null;

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Comments list */}
      {comments.length > 0 ? (
        <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
          {comments.map((comment) => (
            <SingleComment
              key={comment.id}
              comment={comment}
              entityType={entityType}
              entityId={entityId}
              currentUserId={currentUserId}
              onReply={handleReply}
              onRefresh={fetchComments}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-4">
          No comments yet. Start a discussion!
        </p>
      )}

      {/* Reply indicator */}
      {replyingTo && replyingToComment && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded text-xs text-slate-400">
          <span>Replying to</span>
          <span className="text-slate-200 font-medium">
            {replyingToComment.author?.full_name || "Unknown"}
          </span>
          <button
            onClick={() => setReplyingTo(null)}
            className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Add comment form */}
      <div className="pt-3 border-t border-slate-800 space-y-2">
        <textarea
          ref={inputRef}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              handleSubmit();
            }
          }}
          placeholder={replyingTo ? "Write a reply..." : "Add a comment... (Ctrl+Enter to submit)"}
          disabled={submitting}
          rows={2}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/50 disabled:opacity-50 resize-none"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleSubmit}
            disabled={submitting || !newComment.trim()}
            className="px-3 py-1.5 bg-green-400 hover:bg-green-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-950 text-sm font-medium rounded transition-colors flex items-center gap-2"
          >
            {submitting ? <LoadingSpinner size="sm" /> : replyingTo ? "Reply" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
