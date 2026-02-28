// ============================================================
// FILE: app/api/boundaries/[id]/route.ts
// PURPOSE: Update or deactivate a specific boundary
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { isValidUUID } from "@/lib/validation";

// PATCH /api/boundaries/[id] — update boundary value or deactivate
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

  const body = await request.json();
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ boundary: updated });
}

// DELETE /api/boundaries/[id] — hard delete a boundary
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
    .from("user_boundaries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
