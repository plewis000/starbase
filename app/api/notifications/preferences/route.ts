import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform, config } from "@/lib/supabase/schemas";

// =============================================================
// GET /api/notifications/preferences — User's channel preferences
// =============================================================
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all channels
  const { data: channels } = await config(supabase)
    .from("notification_channels")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  // Get user's preferences
  const { data: prefs } = await platform(supabase)
    .from("user_notification_prefs")
    .select("*")
    .eq("user_id", user.id);

  // Merge: show all channels with user's preference (or default)
  const merged = (channels || []).map((channel) => {
    const userPref = prefs?.find((p) => p.channel_id === channel.id);
    return {
      channel_id: channel.id,
      channel_name: channel.name,
      channel_slug: channel.slug,
      channel_icon: channel.icon,
      enabled: userPref?.enabled ?? false,
      config: userPref?.config ?? null,
      pref_id: userPref?.id ?? null,
    };
  });

  return NextResponse.json({ preferences: merged });
}

// =============================================================
// PATCH /api/notifications/preferences — Update preferences
// =============================================================
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { channel_id, enabled, config: channelConfig } = body;

  if (!channel_id) {
    return NextResponse.json(
      { error: "channel_id is required" },
      { status: 400 }
    );
  }

  // Validate channelConfig if provided — must be a plain object, no nested depth > 2
  if (channelConfig !== undefined && channelConfig !== null) {
    if (typeof channelConfig !== "object" || Array.isArray(channelConfig)) {
      return NextResponse.json({ error: "config must be a JSON object" }, { status: 400 });
    }
    const configStr = JSON.stringify(channelConfig);
    if (configStr.length > 5000) {
      return NextResponse.json({ error: "config too large (max 5KB)" }, { status: 400 });
    }
  }

  // Validate enabled is boolean
  if ("enabled" in body && typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  // Check if a preference row already exists
  const { data: existing } = await platform(supabase)
    .from("user_notification_prefs")
    .select("id")
    .eq("user_id", user.id)
    .eq("channel_id", channel_id)
    .single();

  if (existing) {
    // Update existing
    const updateFields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if ("enabled" in body) updateFields.enabled = enabled;
    if ("config" in body) updateFields.config = channelConfig;

    const { data: pref, error } = await platform(supabase)
      .from("user_notification_prefs")
      .update(updateFields)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ preference: pref });
  } else {
    // Create new
    const { data: pref, error } = await platform(supabase)
      .from("user_notification_prefs")
      .insert({
        user_id: user.id,
        channel_id,
        enabled: enabled ?? true,
        config: channelConfig ?? null,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ preference: pref }, { status: 201 });
  }
}
