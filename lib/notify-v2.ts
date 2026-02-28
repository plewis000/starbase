/**
 * Enhanced Notification Engine (v2)
 *
 * Upgrades over v1:
 *   - Watcher-aware: notifies entity watchers based on watch_level
 *   - Mention-aware: notifies @mentioned users
 *   - Subscription-aware: respects per-event-type opt-in/out
 *   - Quiet hours: suppresses notifications during DND
 *   - Grouping: collapses similar notifications
 *   - Discord webhook support (inherited from v1)
 *
 * Usage: call notifyEntity() from API routes after mutations.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { platform } from "@/lib/supabase/schemas";

// ─── Types ───────────────────────────────────────────────────

export type NotifyEventV2 =
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
  | "system";

interface EntityNotifyPayload {
  entityType: string;         // 'task', 'goal', 'habit'
  entityId: string;
  event: NotifyEventV2;
  actorUserId: string;        // Who triggered this
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
  mentionedUserIds?: string[]; // Users @mentioned in a comment
  skipUserIds?: string[];      // Don't notify these users (e.g., the actor)
}

// ─── Core: Entity-aware notification ─────────────────────────

/**
 * Main entry point for v2 notifications.
 * Determines recipients from watchers + mentions, checks subscriptions
 * and quiet hours, then creates grouped notifications.
 */
export async function notifyEntity(
  supabase: SupabaseClient,
  payload: EntityNotifyPayload
): Promise<void> {
  const skipSet = new Set(payload.skipUserIds || []);
  skipSet.add(payload.actorUserId); // Never notify the actor

  // 1. Get watchers for this entity
  const { data: watchers } = await platform(supabase)
    .from("entity_watchers")
    .select("user_id, watch_level")
    .eq("entity_type", payload.entityType)
    .eq("entity_id", payload.entityId);

  // 2. Build recipient set
  const recipients = new Map<string, { source: string }>();

  // Add watchers with watch_level = 'all'
  if (watchers) {
    for (const w of watchers) {
      if (w.watch_level === "muted") continue;
      if (w.watch_level === "mentions_only") continue; // Only get mentioned
      if (skipSet.has(w.user_id)) continue;
      recipients.set(w.user_id, { source: "watcher" });
    }
  }

  // Add mentioned users (always notify, even if watch_level is mentions_only)
  if (payload.mentionedUserIds) {
    for (const uid of payload.mentionedUserIds) {
      if (skipSet.has(uid)) continue;
      // Check if user is muted on this entity
      const watcher = watchers?.find((w) => w.user_id === uid);
      if (watcher?.watch_level === "muted") continue;
      recipients.set(uid, { source: "mention" });
    }

    // Also add mentions_only watchers who were mentioned
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

  // 3. Check subscriptions and quiet hours in batch
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

  // Build lookup maps
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

  // 4. Filter recipients and create notifications
  const groupKey = `${payload.event}:${payload.entityId}`;
  const now = new Date();

  const notifRows: Array<Record<string, unknown>> = [];
  for (const [userId, meta] of recipients) {
    // Check subscription (default: enabled if no record exists)
    const subEnabled = subscriptionMap.get(userId);
    if (subEnabled === false) continue;

    // Check quiet hours
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

  // Batch insert notifications
  const { error } = await platform(supabase)
    .from("notifications")
    .insert(notifRows);

  if (error) {
    console.error("V2 notification batch insert error:", error);
  }

  // 5. Dispatch external channels (Discord) for each recipient
  // Non-blocking — fire and forget
  dispatchExternalChannels(supabase, recipientIds, payload).catch((err) =>
    console.error("External dispatch error:", err)
  );
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
    // Get current time in user's timezone
    const userTime = new Date(
      now.toLocaleString("en-US", { timeZone: prefs.timezone })
    );
    const currentHour = userTime.getHours();
    const currentMinute = userTime.getMinutes();
    const currentDay = userTime.getDay();

    // Check quiet days first
    if (prefs.days && prefs.days.includes(currentDay)) {
      return true;
    }

    // Parse start/end times (format: "HH:MM:SS" or "HH:MM")
    const [startH, startM] = prefs.start.split(":").map(Number);
    const [endH, endM] = prefs.end.split(":").map(Number);

    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);

    // Handle overnight quiet hours (e.g., 22:00 - 07:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    // Same-day quiet hours (e.g., 12:00 - 13:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return false; // If timezone parsing fails, don't suppress
  }
}

// ─── External Channel Dispatch ───────────────────────────────

const EVENT_COLORS: Partial<Record<NotifyEventV2, number>> = {
  task_assigned: 0x3b82f6,
  task_commented: 0x8b5cf6,
  task_overdue: 0xef4444,
  task_completed: 0x22c55e,
  task_handed_off: 0xf97316,
  goal_commented: 0x8b5cf6,
  goal_completed: 0x22c55e,
  habit_commented: 0x8b5cf6,
  mention: 0xeab308,
  system: 0x64748b,
};

const EVENT_EMOJI: Partial<Record<NotifyEventV2, string>> = {
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
  system: "🔔",
};

async function dispatchExternalChannels(
  supabase: SupabaseClient,
  recipientIds: string[],
  payload: EntityNotifyPayload
) {
  // Fetch channel prefs for all recipients
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
  event: NotifyEventV2
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

/**
 * Ensure a user is watching an entity (creates watcher if not exists).
 * Called automatically when a user comments on or interacts with an entity.
 */
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

/**
 * Get user display name for notification titles.
 */
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
