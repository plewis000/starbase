// ============================================================
// FILE: app/api/household/members/route.ts
// PURPOSE: Household member management — add, remove, update roles
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { validateRequiredUUID, validateEnum } from "@/lib/validation";
import type { HouseholdRole } from "@/lib/types";

const VALID_ROLES: readonly HouseholdRole[] = ["admin", "member"] as const;

// GET /api/household/members — list all household members
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await platform(supabase)
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No household found" }, { status: 404 });
  }

  const { data: members, error } = await platform(supabase)
    .from("household_members")
    .select("id, household_id, user_id, role, display_name, joined_at")
    .eq("household_id", membership.household_id)
    .order("joined_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ members: members || [] });
}

// POST /api/household/members — add a member to the household (admin only)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify admin
  const { data: membership } = await platform(supabase)
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();

  const userIdCheck = validateRequiredUUID(body.user_id, "user_id");
  if (!userIdCheck.valid) {
    return NextResponse.json({ error: userIdCheck.error }, { status: 400 });
  }

  const roleCheck = validateEnum(body.role || "member", "role", VALID_ROLES);
  if (!roleCheck.valid) {
    return NextResponse.json({ error: roleCheck.error }, { status: 400 });
  }

  // Check if user already in a household
  const { data: existingMembership } = await platform(supabase)
    .from("household_members")
    .select("id")
    .eq("user_id", userIdCheck.value)
    .single();

  if (existingMembership) {
    return NextResponse.json(
      { error: "User already belongs to a household" },
      { status: 409 }
    );
  }

  const { data: member, error } = await platform(supabase)
    .from("household_members")
    .insert({
      household_id: membership.household_id,
      user_id: userIdCheck.value,
      role: roleCheck.value,
      display_name: body.display_name || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ member }, { status: 201 });
}

// DELETE /api/household/members?user_id=xxx — remove a member (admin only, can't remove self)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetUserId = request.nextUrl.searchParams.get("user_id");
  if (!targetUserId) {
    return NextResponse.json({ error: "user_id query param required" }, { status: 400 });
  }

  if (targetUserId === user.id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  // Verify admin
  const { data: membership } = await platform(supabase)
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { error } = await platform(supabase)
    .from("household_members")
    .delete()
    .eq("household_id", membership.household_id)
    .eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
