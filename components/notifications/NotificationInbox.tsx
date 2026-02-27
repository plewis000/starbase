"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  read_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
  event_type: string | null;
  created_at: string;
}

type FilterType = "all" | "unread";

export default function NotificationInbox() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const eventEmoji: Record<string, string> = {
    task_assigned: "👤",
    task_commented: "💬",
    task_completed: "✅",
    goal_progress: "🎯",
    habit_streak: "🔥",
    habit_check_in: "✓",
    mention: "📣",
  };

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = filter === "unread" ? "/api/notifications?unread=true" : "/api/notifications";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Failed to fetch notifications");
      }
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
        );
      }
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const markAllRead = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
      }
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const dismissNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }
    } catch (err) {
      console.error("Failed to dismiss notification:", err);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read if unread
    if (!notification.read_at) {
      markAsRead(notification.id, {
        stopPropagation: () => {},
      } as React.MouseEvent);
    }

    // Navigate based on entity type
    if (notification.entity_type && notification.entity_id) {
      switch (notification.entity_type) {
        case "task":
          router.push(`/tasks?selected=${notification.entity_id}`);
          break;
        case "goal":
          router.push(`/goals?selected=${notification.entity_id}`);
          break;
        case "habit":
          router.push(`/habits?selected=${notification.entity_id}`);
          break;
      }
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  const filteredNotifications =
    filter === "unread" ? notifications.filter((n) => !n.read_at) : notifications;

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-baseline gap-3">
              <h1 className="text-3xl font-bold text-slate-100">Notifications</h1>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-400 text-slate-950 text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="px-4 py-2 text-sm font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 border-b border-slate-800">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-3 font-medium transition-colors border-b-2 ${
                filter === "all"
                  ? "text-green-400 border-green-400"
                  : "text-slate-400 border-transparent hover:text-slate-100"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-4 py-3 font-medium transition-colors border-b-2 ${
                filter === "unread"
                  ? "text-green-400 border-green-400"
                  : "text-slate-400 border-transparent hover:text-slate-100"
              }`}
            >
              Unread
            </button>
          </div>
        </div>

        {/* Content */}
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-400">Loading notifications...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-red-400">Error: {error}</div>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="text-4xl mb-3">📭</div>
              <div className="text-slate-400 text-center">
                {filter === "unread"
                  ? "No unread notifications"
                  : "No notifications yet"}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  onMouseEnter={() => setHoveredId(notification.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handleNotificationClick(notification)}
                  className={`group p-4 rounded-lg border transition-all cursor-pointer ${
                    notification.read_at
                      ? "bg-slate-900 border-slate-800 hover:border-slate-700"
                      : "bg-slate-900/60 border-green-400/30 hover:border-green-400/50"
                  }`}
                >
                  <div className="flex items-start gap-4 relative">
                    {/* Green left border for unread */}
                    {!notification.read_at && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-400 rounded-l-lg" />
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0 pl-2">
                      <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0">
                          {eventEmoji[notification.event_type || ""] || "🔔"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <h3
                            className={`font-medium leading-tight ${
                              notification.read_at
                                ? "text-slate-400"
                                : "text-slate-100"
                            }`}
                          >
                            {notification.title}
                          </h3>
                          {notification.body && (
                            <p className="text-sm text-slate-400 line-clamp-2 mt-1">
                              {notification.body}
                            </p>
                          )}
                          <p className="text-xs text-slate-500 mt-2">
                            {timeAgo(notification.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Dismiss button - show on hover */}
                    {hoveredId === notification.id && (
                      <button
                        onClick={(e) => dismissNotification(notification.id, e)}
                        className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors p-1.5 hover:bg-slate-800 rounded"
                        aria-label="Dismiss"
                      >
                        <svg
                          width="16"
                          height="16"
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
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
