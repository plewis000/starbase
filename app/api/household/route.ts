// ============================================================
// FILE: app/api/household/route.ts
// PURPOSE: Household CRUD — create, get current household
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { validateRequiredString, validateOptionalString } from "@/lib/validation";

// GET /api/household — get the current user's household with members
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the user's household membership
  const { data: membership, error: memErr } = await platform(supabase)
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return NextResponse.json({ household: null, message: "No household found" });
  }

  // Fetch household with all members
  const { data: household, error: hhErr } = await platform(supabase)
    .from("households")
    .select("*")
    .eq("id", membership.household_id)
    .single();

  if (hhErr || !household) {
    return NextResponse.json({ error: "Failed to load household" }, { status: 500 });
  }

  const { data: members } = await platform(supabase)
    .from("household_members")
    .select("id, household_id, user_id, role, display_name, joined_at")
    .eq("household_id", household.id)
    .order("joined_at");

  return NextResponse.json({
    household: {
      ...household,
      members: members || [],
    },
    current_role: membership.role,
  });
}

// POST /api/household — create a new household (or join existing by invite code later)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user already has a household
  const { data: existing } = await platform(supabase)
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "You already belong to a household" },
      { status: 409 }
    );
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const nameCheck = validateRequiredString(body.name, "name", 100);
  if (!nameCheck.valid) {
    return NextResponse.json({ error: nameCheck.error }, { status: 400 });
  }

  const tzCheck = validateOptionalString(body.timezone, "timezone", 50);
  if (!tzCheck.valid) {
    return NextResponse.json({ error: tzCheck.error }, { status: 400 });
  }

  // Create household
  const { data: household, error: hhErr } = await platform(supabase)
    .from("households")
    .insert({
      name: nameCheck.value,
      timezone: tzCheck.value || "America/Chicago",
    })
    .select("*")
    .single();

  if (hhErr || !household) {
    return NextResponse.json({ error: hhErr?.message || "Failed to create household" }, { status: 500 });
  }

  // Add creator as admin member
  const { error: memErr } = await platform(supabase)
    .from("household_members")
    .insert({
      household_id: household.id,
      user_id: user.id,
      role: "admin",
      display_name: body.display_name || null,
    });

  if (memErr) {
    // Rollback household creation
    await platform(supabase).from("households").delete().eq("id", household.id);
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  return NextResponse.json({ household }, { status: 201 });
}

// PATCH /api/household — update household settings (admin only)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify admin role
  const { data: membership } = await platform(supabase)
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const updateFields: Record<string, unknown> = {};

  if ("name" in body) {
    const check = validateRequiredString(body.name, "name", 100);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.name = check.value;
  }

  if ("timezone" in body) {
    const check = validateRequiredString(body.timezone, "timezone", 50);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.timezone = check.value;
  }

  if ("locale" in body) {
    const check = validateRequiredString(body.locale, "locale", 10);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.locale = check.value;
  }

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updateFields.updated_at = new Date().toISOString();

  const { data: updated, error } = await platform(supabase)
    .from("households")
    .update(updateFields)
    .eq("id", membership.household_id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ household: updated });
}
