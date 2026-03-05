"use client";

import React, { useState, useRef, useEffect } from "react";
import StatusBadge from "@/components/ui/StatusBadge";
import PriorityBadge from "@/components/ui/PriorityBadge";
import { UserSummary } from "@/lib/types";

interface HouseholdMember {
  user_id: string;
  user?: UserSummary | null;
  display_name?: string;
}

interface Tag {
  id: string;
  tag_id: string;
  tag: {
    name: string;
    display_color?: string;
    icon?: string;
  };
}

interface ChecklistItem {
  id: string;
  title: string;
  checked: boolean;
  sort_order: number;
}

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    description?: string;
    due_date?: string;
    completed_at?: string | null;
    recurrence_rule?: string;
    status?: {
      id: string;
      name: string;
      color?: string;
      icon?: string;
      sort_order: number;
    };
    priority?: {
      id: string;
      name: string;
      color?: string;
      icon?: string;
      sort_order: number;
    };
    assignee?: {
      id: string;
      full_name: string;
      email: string;
      avatar_url?: string | null;
    };
    additional_owners?: UserSummary[];
    tags?: Tag[];
    checklist_items?: ChecklistItem[];
    subtask_progress?: { done: number; total: number };
  };
  onSelect: (id: string) => void;
  onQuickComplete?: (id: string) => void;
  isSelected?: boolean;
  members?: HouseholdMember[];
  onOwnersChanged?: (taskId: string, ownerIds: string[]) => void;
}

// Format relative date
const formatRelativeDate = (dateString?: string): string => {
  if (!dateString) return "No date";

  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `Overdue (${Math.abs(diffDays)}d ago)`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return `In ${diffDays}d`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// Get date display color
const getDateColor = (dateString?: string): string => {
  if (!dateString) return "text-slate-400";

  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "text-red-400"; // Overdue
  if (diffDays === 0 || diffDays === 1) return "text-amber-400"; // Today or Tomorrow
  return "text-slate-400";
};

// Get initials for avatar
const getInitials = (fullName?: string): string => {
  if (!fullName) return "?";
  return fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

export default function TaskCard({
  task,
  onSelect,
  onQuickComplete,
  isSelected = false,
  members,
  onOwnersChanged,
}: TaskCardProps) {
  const checklist = task.checklist_items || [];
  const completedChecklist = checklist.filter((item) => item.checked).length;
  const hasChecklist = checklist.length > 0;
  const displayTags = (task.tags || []).slice(0, 2);
  const hiddenTagsCount = Math.max(0, (task.tags || []).length - 2);
  const isCompleted = !!task.completed_at;
  const additionalOwners = task.additional_owners || [];
  const allOwners = [
    ...(task.assignee ? [task.assignee] : []),
    ...additionalOwners,
  ];

  const [showOwnerPopover, setShowOwnerPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showOwnerPopover) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowOwnerPopover(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOwnerPopover]);

  const handleCheckbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onQuickComplete) onQuickComplete(task.id);
  };

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (members && members.length > 1 && onOwnersChanged) {
      setShowOwnerPopover(!showOwnerPopover);
    }
  };

  const toggleOwner = async (memberId: string) => {
    if (!onOwnersChanged) return;
    const currentIds = additionalOwners.map((o) => o.id);
    const nextIds = currentIds.includes(memberId)
      ? currentIds.filter((id) => id !== memberId)
      : [...currentIds, memberId];
    onOwnersChanged(task.id, nextIds);
  };

  return (
    <div
      onClick={() => onSelect(task.id)}
      className={`flex items-center gap-4 p-4 bg-slate-900 border rounded-lg cursor-pointer transition-all hover:bg-slate-800/50 ${
        isSelected
          ? "border-red-400 border-l-4"
          : "border-slate-800 hover:border-slate-700"
      } ${isCompleted ? "opacity-60" : ""}`}
    >
      {/* Quick-complete checkbox */}
      <button
        onClick={handleCheckbox}
        className={`flex-shrink-0 w-5 h-5 rounded border-2 transition-colors flex items-center justify-center ${
          isCompleted
            ? "bg-red-500 border-red-500 text-white"
            : "border-slate-600 hover:border-red-400"
        }`}
        title={isCompleted ? "Completed" : "Mark complete"}
      >
        {isCompleted && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      {/* Task content */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <h3 className={`font-medium truncate mb-1 transition-all duration-300 ${
          isCompleted ? "text-slate-500 line-through" : "text-slate-100"
        }`}>
          {task.recurrence_rule && (
            <span className="text-blue-400 mr-1.5" title="Recurring task">🔄</span>
          )}
          {task.title}
        </h3>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {/* Priority badge */}
          {task.priority && (
            <div className="flex-shrink-0">
              <PriorityBadge priority={task.priority} />
            </div>
          )}

          {/* Due date */}
          {task.due_date && (
            <span className={`${getDateColor(task.due_date)} text-xs font-medium`}>
              {formatRelativeDate(task.due_date)}
            </span>
          )}

          {/* Tags */}
          {displayTags.length > 0 && (
            <div className="flex items-center gap-1">
              {displayTags.filter((tag) => tag.tag).map((tag) => (
                <span
                  key={tag.id}
                  className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700"
                  style={{
                    borderColor: tag.tag?.display_color || undefined,
                    color: tag.tag?.display_color || undefined,
                  }}
                >
                  {tag.tag?.icon && <span className="mr-0.5">{tag.tag.icon}</span>}
                  {tag.tag?.name}
                </span>
              ))}
              {hiddenTagsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium text-slate-400">
                  +{hiddenTagsCount}
                </span>
              )}
            </div>
          )}

          {/* Subtask progress */}
          {task.subtask_progress && task.subtask_progress.total > 0 && (
            <span className="px-2 py-0.5 rounded text-xs font-medium text-slate-400 bg-slate-800/50">
              {task.subtask_progress.done}/{task.subtask_progress.total} subtasks
            </span>
          )}

          {/* Checklist progress */}
          {hasChecklist && (
            <span className="px-2 py-0.5 rounded text-xs font-medium text-slate-400 bg-slate-800/50">
              {completedChecklist}/{checklist.length} ✓
            </span>
          )}
        </div>
      </div>

      {/* Right side: Owner avatars + Chevron */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Owner avatars (stacked, clickable) */}
        <div className="relative" ref={popoverRef}>
          {allOwners.length > 0 && (
            <div
              className="flex -space-x-2 cursor-pointer"
              onClick={handleAvatarClick}
              title={members && members.length > 1 ? "Click to edit owners" : undefined}
            >
              {allOwners.slice(0, 3).map((owner) => (
                <div key={owner.id} className="flex-shrink-0">
                  {owner.avatar_url ? (
                    <img
                      src={owner.avatar_url}
                      alt={owner.full_name}
                      className="w-7 h-7 rounded-full bg-slate-800 object-cover border-2 border-slate-900"
                      title={owner.full_name}
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-semibold text-slate-200 border-2 border-slate-900"
                      title={owner.full_name}
                    >
                      {getInitials(owner.full_name)}
                    </div>
                  )}
                </div>
              ))}
              {allOwners.length > 3 && (
                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-semibold text-slate-300 border-2 border-slate-900">
                  +{allOwners.length - 3}
                </div>
              )}
            </div>
          )}

          {/* Owner popover */}
          {showOwnerPopover && members && members.length > 1 && (
            <div className="absolute right-0 top-full mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 py-1.5 min-w-[160px]">
              <p className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Owners</p>
              {members
                .filter((m) => m.user_id !== task.assignee?.id)
                .map((m) => {
                  const name = m.user?.full_name || m.display_name || m.user_id;
                  const isOwner = additionalOwners.some((o) => o.id === m.user_id);
                  return (
                    <button
                      key={m.user_id}
                      onClick={(e) => { e.stopPropagation(); toggleOwner(m.user_id); }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                        isOwner
                          ? "text-red-300 bg-red-900/20 hover:bg-red-900/30"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center text-[8px] font-semibold flex-shrink-0">
                        {getInitials(name)}
                      </span>
                      <span className="flex-1 truncate">{name.split(" ")[0]}</span>
                      {isOwner && <span className="text-red-400">✓</span>}
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Chevron */}
        <svg
          className="w-5 h-5 text-slate-500 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </div>
  );
}
