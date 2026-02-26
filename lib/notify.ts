/**
 * Notification trigger library.
 * Creates in-app notifications and dispatches to external channels (Discord).
 *
 * Usage: call triggerNotification() from any API route after a mutation.
 * It creates the DB record AND fires the Discord webhook if configured.
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
  | "checklist_complete"
  | "recurrence_created"
  | "system";

interface NotifyPayload {
  recipientUserId: string;
  title: string;
  body?: string;
  event: NotifyEvent;
  sourceUserId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Core: create notification + dispatch ────────────────────

export async function triggerNotification(
  supabase: SupabaseClient,
  payload: NotifyPayload
) {
  // 1. Create in-app notification
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

  // 2. Check user's channel preferences and dispatch
  const { data: prefs } = await platform(supabase)
    .from("user_notification_prefs")
    .select("*, channel:notification_channels!user_notification_prefs_channel_id_fkey(slug)")
    .eq("user_id", payload.recipientUserId)
    .eq("enabled", true);

  if (prefs) {
    for (const pref of prefs) {
      const channelSlug = (pref.channel as { slug: string })?.slug;
      if (channelSlug === "discord" && pref.config?.webhook_url) {
        await sendDiscordWebhook(
          pref.config.webhook_url as string,
          payload.title,
          payload.body || "",
          payload.event
        );
        // Mark as sent
        await platform(supabase)
          .from("notifications")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", notification.id);
      }
      // Future: add email, SMS, browser push handlers here
    }
  }

  return notification;
}

// ─── Discord webhook ─────────────────────────────────────────

const EVENT_COLORS: Record<NotifyEvent, number> = {
  task_assigned: 0x3b82f6,    // blue
  task_commented: 0x8b5cf6,   // purple
  task_overdue: 0xef4444,     // red
  task_completed: 0x22c55e,   // green
  task_handed_off: 0xf97316,  // orange
  checklist_complete: 0x06b6d4,// cyan
  recurrence_created: 0xeab308,// yellow
  system: 0x64748b,           // gray
};

const EVENT_EMOJI: Record<NotifyEvent, string> = {
  task_assigned: "👤",
  task_commented: "💬",
  task_overdue: "⏰",
  task_completed: "✅",
  task_handed_off: "🔄",
  checklist_complete: "☑️",
  recurrence_created: "🔁",
  system: "🔔",
};

async function sendDiscordWebhook(
  webhookUrl: string,
  title: string,
  body: string,
  event: NotifyEvent
) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: `${EVENT_EMOJI[event]} ${title}`,
            description: body || undefined,
            color: EVENT_COLORS[event],
            timestamp: new Date().toISOString(),
            footer: { text: "Starbase" },
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Discord webhook failed:", response.status, await response.text());
    }
  } catch (err) {
    console.error("Discord webhook error:", err);
  }
}

// ─── Convenience helpers for common events ───────────────────

export async function notifyTaskAssigned(
  supabase: SupabaseClient,
  taskTitle: string,
  assigneeUserId: string,
  assignerUserId: string,
  taskId: string
) {
  // Don't notify if assigning to yourself
  if (assigneeUserId === assignerUserId) return;

  // Get assigner name
  const { data: assigner } = await platform(supabase)
    .from("users")
    .select("full_name, email")
    .eq("id", assignerUserId)
    .single();

  const name = assigner?.full_name || assigner?.email || "Someone";

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
  // Get commenter name
  const { data: commenter } = await platform(supabase)
    .from("users")
    .select("full_name, email")
    .eq("id", commenterId)
    .single();

  const name = commenter?.full_name || commenter?.email || "Someone";

  // Notify all users involved with the task EXCEPT the commenter
  // "Involved" = creator + assignee + previous commenters
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
  involvedIds.delete(commenterId); // Don't notify the commenter

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
  const { data: completer } = await platform(supabase)
    .from("users")
    .select("full_name, email")
    .eq("id", completerId)
    .single();

  const name = completer?.full_name || completer?.email || "Someone";

  // Notify task creator if different from completer
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
