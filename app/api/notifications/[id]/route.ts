import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";

// =============================================================
// PATCH /api/notifications/:id — Mark read/unread
// =============================================================
export const PATCH = withUser(async (request: NextRequest, { supabase, user }, params) => {
  const id = params?.id;

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const updateFields: Record<string, unknown> = {};

  if ("read" in body) {
    updateFields.read_at = body.read ? new Date().toISOString() : null;
  }

  const { data: notification, error } = await platform(supabase)
    .from("notifications")
    .update(updateFields)
    .eq("id", id)
    .eq("user_id", user.id) // Users can only modify their own
    .select("*")
    .single();

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ notification });
});

// =============================================================
// DELETE /api/notifications/:id — Dismiss notification
// =============================================================
export const DELETE = withUser(async (_request: NextRequest, { supabase, user }, params) => {
  const id = params?.id;

  const { error } = await platform(supabase)
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
