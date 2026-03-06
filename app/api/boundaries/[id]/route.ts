// ============================================================
// FILE: app/api/boundaries/[id]/route.ts
// PURPOSE: Update or deactivate a specific boundary
// PART OF: The Keep
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { isValidUUID } from "@/lib/validation";

// PATCH /api/boundaries/[id] — update boundary value or deactivate
export const PATCH = withAuth(async (request: NextRequest, { supabase, user }, params) => {
  const id = params?.id;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("boundary_value" in body) {
    if (typeof body.boundary_value !== "object") {
      return NextResponse.json({ error: "boundary_value must be a JSON object" }, { status: 400 });
    }
    updateFields.boundary_value = body.boundary_value;
  }

  if ("is_active" in body) {
    updateFields.is_active = !!body.is_active;
  }

  if ("reason" in body) {
    updateFields.reason = body.reason;
  }

  const { data: updated, error } = await platform(supabase)
    .from("user_boundaries")
    .update(updateFields)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ boundary: updated });
});

// DELETE /api/boundaries/[id] — hard delete a boundary
export const DELETE = withAuth(async (_request: NextRequest, { supabase, user }, params) => {
  const id = params?.id;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { error } = await platform(supabase)
    .from("user_boundaries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
