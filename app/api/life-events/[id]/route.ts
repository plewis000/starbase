// ============================================================
// FILE: app/api/life-events/[id]/route.ts
// PURPOSE: Update or end a life event
// PART OF: The Keep
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { isValidUUID } from "@/lib/validation";

// PATCH /api/life-events/[id] — update or end a life event
export const PATCH = withUser(async (request: NextRequest, { supabase, user }, params) => {
  const id = params?.id;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const updateFields: Record<string, unknown> = {};

  if ("title" in body) updateFields.title = body.title;
  if ("description" in body) updateFields.description = body.description;
  if ("impact" in body) updateFields.impact = body.impact;
  if ("is_ongoing" in body) updateFields.is_ongoing = body.is_ongoing;
  if ("ended_at" in body) {
    updateFields.ended_at = body.ended_at;
    updateFields.is_ongoing = false;
  }
  if ("xp_multiplier" in body) updateFields.xp_multiplier = body.xp_multiplier;
  if ("ai_notes" in body) updateFields.ai_notes = body.ai_notes;
  if ("affected_categories" in body) updateFields.affected_categories = body.affected_categories;

  const { data: updated, error } = await platform(supabase)
    .from("life_events")
    .update(updateFields)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ event: updated });
});

// DELETE /api/life-events/[id]
export const DELETE = withUser(async (_request: NextRequest, { supabase, user }, params) => {
  const id = params?.id;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { error } = await platform(supabase)
    .from("life_events")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
