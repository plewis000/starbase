// ============================================================
// FILE: app/api/life-events/[id]/route.ts
// PURPOSE: Update or end a life event
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { isValidUUID } from "@/lib/validation";

// PATCH /api/life-events/[id] — update or end a life event
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ event: updated });
}

// DELETE /api/life-events/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { error } = await platform(supabase)
    .from("life_events")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
