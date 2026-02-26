import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { safeParseBody, isValidUUID, validatePagination } from "@/lib/validation";

// =============================================================
// GET /api/notifications — User's notification inbox (with grouping)
// =============================================================
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const unreadOnly = params.get("unread") === "true";
  const grouped = params.get("grouped") === "true";
  const entityType = params.get("entity_type"); // filter by entity
  const eventType = params.get("event_type");   // filter by event
  const { limit, offset } = validatePagination(params.get("limit"), params.get("offset"));

  let query = platform(supabase)
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  if (entityType) {
    query = query.eq("entity_type", entityType);
  }

  if (eventType) {
    query = query.eq("event_type", eventType);
  }

  const { data: notifications, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Unread count
  const { count: unreadCount } = await platform(supabase)
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  // If grouped mode, collapse by group_key
  if (grouped && notifications) {
    const groupMap = new Map<string, {
      latest: Record<string, unknown>;
      count: number;
      items: Record<string, unknown>[];
    }>();

    for (const n of notifications) {
      const key = (n as Record<string, unknown>).group_key as string || (n as Record<string, unknown>).id as string;
      if (!groupMap.has(key)) {
        groupMap.set(key, { latest: n as Record<string, unknown>, count: 1, items: [n as Record<string, unknown>] });
      } else {
        const group = groupMap.get(key)!;
        group.count++;
        group.items.push(n as Record<string, unknown>);
      }
    }

    const groupedNotifications = Array.from(groupMap.values()).map((g) => ({
      ...g.latest,
      group_count: g.count,
      is_grouped: g.count > 1,
    }));

    return NextResponse.json({
      notifications: groupedNotifications,
      total: count || 0,
      unread_count: unreadCount || 0,
    });
  }

  return NextResponse.json({
    notifications: notifications || [],
    total: count || 0,
    unread_count: unreadCount || 0,
  });
}

// =============================================================
// POST /api/notifications — Bulk actions
// =============================================================
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await safeParseBody(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { action, notification_ids } = parsed.body;

  switch (action) {
    case "mark_all_read": {
      const { error } = await platform(supabase)
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    case "mark_read": {
      // Mark specific notifications as read
      if (!notification_ids || !Array.isArray(notification_ids)) {
        return NextResponse.json({ error: "notification_ids array required for mark_read" }, { status: 400 });
      }
      // Validate all IDs
      for (const nid of notification_ids) {
        if (!isValidUUID(nid)) {
          return NextResponse.json({ error: `Invalid notification ID: ${String(nid).slice(0, 50)}` }, { status: 400 });
        }
      }

      const { error } = await platform(supabase)
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .in("id", notification_ids as string[])
        .is("read_at", null);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    case "mark_group_read": {
      // Mark all notifications with a specific group_key as read
      const groupKey = parsed.body.group_key;
      if (!groupKey || typeof groupKey !== "string") {
        return NextResponse.json({ error: "group_key required for mark_group_read" }, { status: 400 });
      }

      const { error } = await platform(supabase)
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("group_key", groupKey)
        .is("read_at", null);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action. Valid: mark_all_read, mark_read, mark_group_read" }, { status: 400 });
  }
}
