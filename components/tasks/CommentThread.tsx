"use client";

import React, { useState, useRef, useEffect } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { Comment, UserSummary } from "@/lib/types";

interface CommentThreadProps {
  taskId: string;
  comments: Comment[];
  onCommentAdded: () => void;
}

interface MentionSuggestion {
  id: string;
  display_name: string;
  full_name: string;
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

// Render comment text with @mention highlighting
const renderCommentWithMentions = (text: string): React.ReactNode => {
  const mentionRegex = /@([\w][\w.@-]{0,100})/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add highlighted mention
    parts.push(
      <span
        key={match.index}
        className="bg-red-400/20 text-red-300 px-1 rounded font-medium"
      >
        @{match[1]}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 1 ? <>{parts}</> : text;
};

export default function CommentThread({
  taskId,
  comments: initialComments,
  onCommentAdded,
}: CommentThreadProps) {
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [householdMembers, setHouseholdMembers] = useState<MentionSuggestion[]>([]);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([]);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const threadsEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  const scrollToBottom = () => {
    threadsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Handle @mention autocomplete
  const handleInputChange = (value: string) => {
    setNewComment(value);

    // Check if user is typing a mention
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase();
      setMentionQuery(query);

      const filteredMembers = householdMembers.filter(member =>
        member.display_name.toLowerCase().includes(query) ||
        member.full_name.toLowerCase().includes(query)
      );

      setMentionSuggestions(filteredMembers);
      setShowMentionSuggestions(filteredMembers.length > 0);
      setSelectedSuggestionIndex(0);
    } else {
      setShowMentionSuggestions(false);
    }
  };

  const insertMention = (member: MentionSuggestion) => {
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = newComment.slice(0, cursorPos);
    const textAfterCursor = newComment.slice(cursorPos);

    // Replace the @query with @display_name
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      const beforeMention = textBeforeCursor.slice(0, mentionMatch.index);
      const newText = `${beforeMention}@${member.display_name} ${textAfterCursor}`;
      setNewComment(newText);

      // Focus and position cursor after the mention
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = beforeMention.length + member.display_name.length + 2; // +2 for @ and space
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    }

    setShowMentionSuggestions(false);
  };

  useEffect(() => {
    scrollToBottom();
  }, [comments]);

  // Fetch household members for @mention autocomplete
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const response = await fetch('/api/household/members');
        if (response.ok) {
          const data = await response.json();
          const members = data.members?.map((m: any) => ({
            id: m.user_id,
            display_name: m.display_name || m.user?.full_name || 'Member',
            full_name: m.user?.full_name || m.display_name || 'Member',
          })) || [];
          setHouseholdMembers(members);
        }
      } catch (error) {
        console.error('Failed to fetch household members:', error);
      }
    };

    fetchMembers();
  }, []);

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
                  {renderCommentWithMentions(comment.body)}
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
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (showMentionSuggestions) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSelectedSuggestionIndex(prev =>
                    prev < mentionSuggestions.length - 1 ? prev + 1 : 0
                  );
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSelectedSuggestionIndex(prev =>
                    prev > 0 ? prev - 1 : mentionSuggestions.length - 1
                  );
                } else if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  insertMention(mentionSuggestions[selectedSuggestionIndex]);
                } else if (e.key === "Escape") {
                  setShowMentionSuggestions(false);
                }
              } else if (e.key === "Enter" && e.ctrlKey) {
                handleSubmitComment();
              }
            }}
            placeholder="Add a comment... Use @name to mention someone (Ctrl+Enter to submit)"
            disabled={submitting}
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/50 disabled:opacity-50 resize-none"
          />

          {/* @mention autocomplete dropdown */}
          {showMentionSuggestions && mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
              {mentionSuggestions.map((member, index) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => insertMention(member)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-700 transition-colors ${
                    index === selectedSuggestionIndex ? 'bg-slate-700' : ''
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-[10px] font-semibold text-slate-200">
                    {getInitials(member.full_name)}
                  </div>
                  <div>
                    <div className="text-slate-100 font-medium">{member.display_name}</div>
                    {member.display_name !== member.full_name && (
                      <div className="text-slate-400 text-xs">{member.full_name}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
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
