import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { safeParseBody, validateRequiredString, validateEnum } from "@/lib/validation";

// All available event types
const VALID_EVENT_TYPES = [
  "task_assigned", "task_commented", "task_overdue", "task_completed",
  "task_handed_off", "task_status_changed", "goal_commented",
  "goal_completed", "goal_milestone_completed", "habit_commented",
  "habit_streak_milestone", "mention", "checklist_complete",
  "recurrence_created", "entity_updated", "system",
] as const;

// ---- GET: List all notification subscriptions + quiet hours ----

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [subsRes, prefsRes] = await Promise.all([
    platform(supabase)
      .from("notification_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("event_type"),
    platform(supabase)
      .from("user_notification_prefs")
      .select("quiet_hours_start, quiet_hours_end, quiet_days, timezone")
      .eq("user_id", user.id),
  ]);

  // Build a complete map of all event types with defaults
  const subMap = new Map(
    (subsRes.data || []).map((s) => [s.event_type, s])
  );

  const allSubscriptions = VALID_EVENT_TYPES.map((et) => ({
    event_type: et,
    enabled: subMap.has(et) ? subMap.get(et)!.enabled : true, // Default enabled
    id: subMap.get(et)?.id || null,
  }));

  // Quiet hours (from first pref record, if any)
  const quietHours = prefsRes.data && prefsRes.data.length > 0
    ? {
        quiet_hours_start: prefsRes.data[0].quiet_hours_start,
        quiet_hours_end: prefsRes.data[0].quiet_hours_end,
        quiet_days: prefsRes.data[0].quiet_days,
        timezone: prefsRes.data[0].timezone || "America/Chicago",
      }
    : {
        quiet_hours_start: null,
        quiet_hours_end: null,
        quiet_days: null,
        timezone: "America/Chicago",
      };

  return NextResponse.json({
    subscriptions: allSubscriptions,
    quiet_hours: quietHours,
    available_event_types: VALID_EVENT_TYPES,
  });
}

// ---- POST: Update subscription for a specific event type ----

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await safeParseBody(request);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { event_type, enabled } = parsed.body;

  const etCheck = validateEnum(event_type as string, "event_type", VALID_EVENT_TYPES);
  if (!etCheck.valid) return NextResponse.json({ error: etCheck.error }, { status: 400 });

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const { data: sub, error } = await platform(supabase)
    .from("notification_subscriptions")
    .upsert(
      {
        user_id: user.id,
        event_type: etCheck.value,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,event_type" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ subscription: sub });
}

// ---- PATCH: Update quiet hours ----

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await safeParseBody(request);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { quiet_hours_start, quiet_hours_end, quiet_days, timezone } = parsed.body;

  // Validate time format (HH:MM or HH:MM:SS)
  const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;
  if (quiet_hours_start && !TIME_REGEX.test(quiet_hours_start as string)) {
    return NextResponse.json({ error: "quiet_hours_start must be in HH:MM format" }, { status: 400 });
  }
  if (quiet_hours_end && !TIME_REGEX.test(quiet_hours_end as string)) {
    return NextResponse.json({ error: "quiet_hours_end must be in HH:MM format" }, { status: 400 });
  }

  // Validate quiet_days (array of 0-6)
  if (quiet_days !== undefined && quiet_days !== null) {
    if (!Array.isArray(quiet_days)) {
      return NextResponse.json({ error: "quiet_days must be an array" }, { status: 400 });
    }
    for (const d of quiet_days) {
      if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6) {
        return NextResponse.json({ error: "quiet_days values must be integers 0-6" }, { status: 400 });
      }
    }
  }

  // Validate timezone
  if (timezone && typeof timezone !== "string") {
    return NextResponse.json({ error: "timezone must be a string" }, { status: 400 });
  }

  // Build update fields
  const updates: Record<string, unknown> = { user_id: user.id };
  if (quiet_hours_start !== undefined) updates.quiet_hours_start = quiet_hours_start || null;
  if (quiet_hours_end !== undefined) updates.quiet_hours_end = quiet_hours_end || null;
  if (quiet_days !== undefined) updates.quiet_days = quiet_days || null;
  if (timezone !== undefined) updates.timezone = timezone || "America/Chicago";

  // Check if pref record exists; if not, create one first
  const { data: existing } = await platform(supabase)
    .from("user_notification_prefs")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (!existing || existing.length === 0) {
    // No pref records exist yet — we need a channel_id to insert
    // Find the default "in_app" channel
    const { data: defaultChannel } = await platform(supabase)
      .from("notification_channels")
      .select("id")
      .eq("slug", "in_app")
      .single();

    if (defaultChannel) {
      const { error: insertErr } = await platform(supabase)
        .from("user_notification_prefs")
        .insert({
          user_id: user.id,
          channel_id: defaultChannel.id,
          enabled: true,
          ...updates,
        });
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: "Cannot update quiet hours: no notification channel configured" }, { status: 500 });
    }
  } else {
    // Update existing records
    const { error } = await platform(supabase)
      .from("user_notification_prefs")
      .update(updates)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: updates });
}
