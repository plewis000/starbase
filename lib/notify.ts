/**
 * Notification Engine — consolidated from v1 + v2
 *
 * Features:
 *   - Watcher-aware: notifies entity watchers based on watch_level
 *   - Mention-aware: notifies @mentioned users
 *   - Subscription-aware: respects per-event-type opt-in/out
 *   - Quiet hours: suppresses notifications during DND
 *   - Grouping: collapses similar notifications
 *   - Discord webhook support
 *   - Simple single-recipient notifications (triggerNotification)
 *   - Convenience helpers for common events (task assigned/commented/completed)
 *
 * Usage:
 *   - Entity-aware (watchers, mentions): notifyEntity()
 *   - Simple single-recipient: triggerNotification()
 *   - Task-specific: notifyTaskAssigned(), notifyTaskCommented(), notifyTaskCompleted()
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { platform } from "@/lib/supabase/schemas";

// ─── Types ───────────────────────────────────────────────────

export type NotifyEvent =
  | "task_assigned"
  | "task_commented"
  | "task_overdue"
  | "task_completed"
  | "task_handed_off"
  | "task_status_changed"
  | "goal_commented"
  | "goal_completed"
  | "goal_milestone_completed"
  | "habit_commented"
  | "habit_streak_milestone"
  | "mention"
  | "checklist_complete"
  | "recurrence_created"
  | "entity_updated"
  | "achievement_unlocked"
  | "level_up"
  | "loot_box_earned"
  | "system";

// Keep v2 alias for any code that imported the old type name
export type NotifyEventV2 = NotifyEvent;

interface EntityNotifyPayload {
  entityType: string;         // 'task', 'goal', 'habit'
  entityId: string;
  event: NotifyEvent;
  actorUserId: string;        // Who triggered this
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
  mentionedUserIds?: string[]; // Users @mentioned in a comment
  skipUserIds?: string[];      // Don't notify these users (e.g., the actor)
}

interface NotifyPayload {
  recipientUserId: string;
  title: string;
  body?: string;
  event: NotifyEvent;
  sourceUserId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Colors & Emoji ─────────────────────────────────────────

const EVENT_COLORS: Partial<Record<NotifyEvent, number>> = {
  task_assigned: 0x3b82f6,
  task_commented: 0x8b5cf6,
  task_overdue: 0xef4444,
  task_completed: 0x22c55e,
  task_handed_off: 0xf97316,
  goal_commented: 0x8b5cf6,
  goal_completed: 0x22c55e,
  habit_commented: 0x8b5cf6,
  mention: 0xeab308,
  checklist_complete: 0x06b6d4,
  recurrence_created: 0xeab308,
  achievement_unlocked: 0xDC2626,
  level_up: 0xDC2626,
  loot_box_earned: 0xD4A857,
  system: 0x64748b,
};

const EVENT_EMOJI: Partial<Record<NotifyEvent, string>> = {
  task_assigned: "👤",
  task_commented: "💬",
  task_overdue: "⏰",
  task_completed: "✅",
  task_handed_off: "🔄",
  goal_commented: "💬",
  goal_completed: "🎯",
  goal_milestone_completed: "🏆",
  habit_commented: "💬",
  habit_streak_milestone: "🔥",
  mention: "📣",
  checklist_complete: "☑️",
  recurrence_created: "🔁",
  achievement_unlocked: "🏆",
  level_up: "⬆️",
  loot_box_earned: "📦",
  system: "🔔",
};

// ─── Core: Entity-aware notification ─────────────────────────

/**
 * Main entry point for entity-aware notifications.
 * Determines recipients from watchers + mentions, checks subscriptions
 * and quiet hours, then creates grouped notifications.
 */
export async function notifyEntity(
  supabase: SupabaseClient,
  payload: EntityNotifyPayload
): Promise<void> {
  const skipSet = new Set(payload.skipUserIds || []);
  skipSet.add(payload.actorUserId);

  const { data: watchers } = await platform(supabase)
    .from("entity_watchers")
    .select("user_id, watch_level")
    .eq("entity_type", payload.entityType)
    .eq("entity_id", payload.entityId);

  const recipients = new Map<string, { source: string }>();

  if (watchers) {
    for (const w of watchers) {
      if (w.watch_level === "muted") continue;
      if (w.watch_level === "mentions_only") continue;
      if (skipSet.has(w.user_id)) continue;
      recipients.set(w.user_id, { source: "watcher" });
    }
  }

  if (payload.mentionedUserIds) {
    for (const uid of payload.mentionedUserIds) {
      if (skipSet.has(uid)) continue;
      const watcher = watchers?.find((w) => w.user_id === uid);
      if (watcher?.watch_level === "muted") continue;
      recipients.set(uid, { source: "mention" });
    }

    if (watchers) {
      for (const w of watchers) {
        if (w.watch_level !== "mentions_only") continue;
        if (skipSet.has(w.user_id)) continue;
        if (payload.mentionedUserIds.includes(w.user_id)) {
          recipients.set(w.user_id, { source: "mention" });
        }
      }
    }
  }

  if (recipients.size === 0) return;

  const recipientIds = Array.from(recipients.keys());

  const [subsRes, prefsRes] = await Promise.all([
    platform(supabase)
      .from("notification_subscriptions")
      .select("user_id, event_type, enabled")
      .in("user_id", recipientIds)
      .eq("event_type", payload.event),
    platform(supabase)
      .from("user_notification_prefs")
      .select("user_id, quiet_hours_start, quiet_hours_end, quiet_days, timezone")
      .in("user_id", recipientIds),
  ]);

  const subscriptionMap = new Map<string, boolean>();
  if (subsRes.data) {
    for (const s of subsRes.data) {
      subscriptionMap.set(s.user_id, s.enabled);
    }
  }

  const quietMap = new Map<string, {
    start: string | null;
    end: string | null;
    days: number[] | null;
    timezone: string;
  }>();
  if (prefsRes.data) {
    for (const p of prefsRes.data) {
      quietMap.set(p.user_id, {
        start: p.quiet_hours_start,
        end: p.quiet_hours_end,
        days: p.quiet_days,
        timezone: p.timezone || "America/Chicago",
      });
    }
  }

  const groupKey = `${payload.event}:${payload.entityId}`;
  const now = new Date();

  const notifRows: Array<Record<string, unknown>> = [];
  for (const [userId, meta] of recipients) {
    const subEnabled = subscriptionMap.get(userId);
    if (subEnabled === false) continue;

    const quiet = quietMap.get(userId);
    if (quiet && isInQuietHours(now, quiet)) continue;

    notifRows.push({
      user_id: userId,
      title: payload.title,
      body: payload.body || null,
      source: payload.event,
      entity_type: payload.entityType,
      entity_id: payload.entityId,
      event_type: payload.event,
      group_key: groupKey,
      metadata: {
        ...payload.metadata,
        source_user_id: payload.actorUserId,
        notification_source: meta.source,
      },
    });
  }

  if (notifRows.length === 0) return;

  const { error } = await platform(supabase)
    .from("notifications")
    .insert(notifRows);

  if (error) {
    console.error("Notification batch insert error:", error);
  }

  dispatchExternalChannels(supabase, recipientIds, payload).catch((err) =>
    console.error("External dispatch error:", err)
  );
}

// ─── Simple single-recipient notification ────────────────────

/**
 * Simple notification for a single recipient.
 * Creates the DB record and dispatches to external channels.
 */
export async function triggerNotification(
  supabase: SupabaseClient,
  payload: NotifyPayload
) {
  const { data: notification, error } = await platform(supabase)
    .from("notifications")
    .insert({
      user_id: payload.recipientUserId,
      title: payload.title,
      body: payload.body || null,
      source: payload.event,
      metadata: {
        ...payload.metadata,
        source_user_id: payload.sourceUserId,
      },
    })
    .select("*")
    .single();

  if (error) {
    console.error("Notification creation error:", error);
    return null;
  }

  const { data: prefs } = await platform(supabase)
    .from("user_notification_prefs")
    .select("*, channel:notification_channels!user_notification_prefs_channel_id_fkey(slug)")
    .eq("user_id", payload.recipientUserId)
    .eq("enabled", true);

  if (prefs) {
    for (const pref of prefs) {
      const channelData = pref.channel as unknown as { slug: string } | { slug: string }[] | null;
      const channelSlug = Array.isArray(channelData) ? channelData[0]?.slug : channelData?.slug;
      if (channelSlug === "discord" && pref.config?.webhook_url) {
        await sendDiscordWebhook(
          pref.config.webhook_url as string,
          payload.title,
          payload.body || "",
          payload.event
        );
        await platform(supabase)
          .from("notifications")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", notification.id);
      }
    }
  }

  return notification;
}

// ─── Quiet Hours Check ───────────────────────────────────────

function isInQuietHours(
  now: Date,
  prefs: {
    start: string | null;
    end: string | null;
    days: number[] | null;
    timezone: string;
  }
): boolean {
  if (!prefs.start || !prefs.end) return false;

  try {
    const userTime = new Date(
      now.toLocaleString("en-US", { timeZone: prefs.timezone })
    );
    const currentHour = userTime.getHours();
    const currentMinute = userTime.getMinutes();
    const currentDay = userTime.getDay();

    if (prefs.days && prefs.days.includes(currentDay)) {
      return true;
    }

    const [startH, startM] = prefs.start.split(":").map(Number);
    const [endH, endM] = prefs.end.split(":").map(Number);

    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);

    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return false;
  }
}

// ─── External Channel Dispatch ───────────────────────────────

async function dispatchExternalChannels(
  supabase: SupabaseClient,
  recipientIds: string[],
  payload: EntityNotifyPayload
) {
  const { data: prefs } = await platform(supabase)
    .from("user_notification_prefs")
    .select("user_id, enabled, config, channel:notification_channels!user_notification_prefs_channel_id_fkey(slug)")
    .in("user_id", recipientIds)
    .eq("enabled", true);

  if (!prefs) return;

  for (const pref of prefs) {
    const channelData = pref.channel as unknown as { slug: string } | { slug: string }[] | null;
    const channelSlug = Array.isArray(channelData) ? channelData[0]?.slug : channelData?.slug;
    if (channelSlug === "discord" && pref.config?.webhook_url) {
      await sendDiscordWebhook(
        pref.config.webhook_url as string,
        payload.title,
        payload.body || "",
        payload.event
      );
    }
  }
}

async function sendDiscordWebhook(
  webhookUrl: string,
  title: string,
  body: string,
  event: NotifyEvent
) {
  try {
    const emoji = EVENT_EMOJI[event] || "🔔";
    const color = EVENT_COLORS[event] || 0x64748b;

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: `${emoji} ${title}`,
            description: body || undefined,
            color,
            timestamp: new Date().toISOString(),
            footer: { text: "Desperado Club" },
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Discord webhook failed:", response.status);
    }
  } catch (err) {
    console.error("Discord webhook error:", err);
  }
}

// ─── Convenience: Auto-watch on first interaction ────────────

export async function ensureWatching(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
  userId: string,
  watchLevel = "all"
): Promise<void> {
  const { error } = await platform(supabase)
    .from("entity_watchers")
    .upsert(
      {
        entity_type: entityType,
        entity_id: entityId,
        user_id: userId,
        watch_level: watchLevel,
      },
      { onConflict: "entity_type,entity_id,user_id" }
    );

  if (error) {
    console.error("Failed to ensure watcher:", error);
  }
}

export async function getUserDisplayName(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await platform(supabase)
    .from("users")
    .select("full_name, display_name, email")
    .eq("id", userId)
    .single();

  return data?.display_name || data?.full_name || data?.email || "Someone";
}

// ─── Task-specific convenience helpers ───────────────────────

export async function notifyTaskAssigned(
  supabase: SupabaseClient,
  taskTitle: string,
  assigneeUserId: string,
  assignerUserId: string,
  taskId: string
) {
  if (assigneeUserId === assignerUserId) return;

  const name = await getUserDisplayName(supabase, assignerUserId);

  return triggerNotification(supabase, {
    recipientUserId: assigneeUserId,
    title: `${name} assigned you: ${taskTitle}`,
    body: `You've been assigned a new task.`,
    event: "task_assigned",
    sourceUserId: assignerUserId,
    metadata: { task_id: taskId },
  });
}

export async function notifyTaskCommented(
  supabase: SupabaseClient,
  taskId: string,
  taskTitle: string,
  commenterId: string,
  commentBody: string
) {
  const name = await getUserDisplayName(supabase, commenterId);

  const { data: task } = await platform(supabase)
    .from("tasks")
    .select("created_by, assigned_to")
    .eq("id", taskId)
    .single();

  const { data: commenters } = await platform(supabase)
    .from("task_comments")
    .select("user_id")
    .eq("task_id", taskId);

  const involvedIds = new Set<string>();
  if (task?.created_by) involvedIds.add(task.created_by);
  if (task?.assigned_to) involvedIds.add(task.assigned_to);
  if (commenters) {
    for (const c of commenters) {
      involvedIds.add(c.user_id);
    }
  }
  involvedIds.delete(commenterId);

  const truncatedBody =
    commentBody.length > 200 ? commentBody.slice(0, 200) + "..." : commentBody;

  const promises = Array.from(involvedIds).map((userId) =>
    triggerNotification(supabase, {
      recipientUserId: userId,
      title: `${name} commented on: ${taskTitle}`,
      body: truncatedBody,
      event: "task_commented",
      sourceUserId: commenterId,
      metadata: { task_id: taskId },
    })
  );

  await Promise.all(promises);
}

export async function notifyTaskCompleted(
  supabase: SupabaseClient,
  taskId: string,
  taskTitle: string,
  completerId: string
) {
  const name = await getUserDisplayName(supabase, completerId);

  const { data: task } = await platform(supabase)
    .from("tasks")
    .select("created_by, assigned_to")
    .eq("id", taskId)
    .single();

  const recipients = new Set<string>();
  if (task?.created_by) recipients.add(task.created_by);
  if (task?.assigned_to) recipients.add(task.assigned_to);
  recipients.delete(completerId);

  const promises = Array.from(recipients).map((userId) =>
    triggerNotification(supabase, {
      recipientUserId: userId,
      title: `${name} completed: ${taskTitle}`,
      event: "task_completed",
      sourceUserId: completerId,
      metadata: { task_id: taskId },
    })
  );

  await Promise.all(promises);
}
