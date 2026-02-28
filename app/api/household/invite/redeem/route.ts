// ============================================================
// FILE: app/api/household/invite/redeem/route.ts
// PURPOSE: Redeem an invite code — join a household
//          No UUID needed, just the 6-character code
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { validateRequiredString } from "@/lib/validation";

// POST /api/household/invite/redeem — join household using invite code
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user already in a household
  const { data: existingMembership } = await platform(supabase)
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership) {
    return NextResponse.json(
      { error: "You already belong to a household" },
      { status: 409 }
    );
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const codeCheck = validateRequiredString(body.invite_code, "invite_code", 20);
  if (!codeCheck.valid) {
    return NextResponse.json({ error: codeCheck.error }, { status: 400 });
  }

  // Normalize code (uppercase, trim)
  const code = codeCheck.value.toUpperCase().trim();

  // Find the invite
  const { data: invite, error: inviteErr } = await platform(supabase)
    .from("household_invites")
    .select("*")
    .eq("invite_code", code)
    .eq("is_active", true)
    .single();

  if (inviteErr || !invite) {
    return NextResponse.json({ error: "Invalid or expired invite code" }, { status: 404 });
  }

  // Check expiry
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    // Deactivate expired invite
    await platform(supabase)
      .from("household_invites")
      .update({ is_active: false })
      .eq("id", invite.id);

    return NextResponse.json({ error: "This invite code has expired" }, { status: 410 });
  }

  // Check usage limit
  if (invite.times_used >= invite.max_uses) {
    await platform(supabase)
      .from("household_invites")
      .update({ is_active: false })
      .eq("id", invite.id);

    return NextResponse.json({ error: "This invite code has reached its usage limit" }, { status: 410 });
  }

  // Add user to household
  const { error: memberErr } = await platform(supabase)
    .from("household_members")
    .insert({
      household_id: invite.household_id,
      user_id: user.id,
      role: invite.role,
      display_name: body.display_name || null,
    });

  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  // Increment usage count
  await platform(supabase)
    .from("household_invites")
    .update({
      times_used: invite.times_used + 1,
      is_active: invite.times_used + 1 < invite.max_uses,
    })
    .eq("id", invite.id);

  // Fetch household name for the welcome message
  const { data: household } = await platform(supabase)
    .from("households")
    .select("name")
    .eq("id", invite.household_id)
    .single();

  return NextResponse.json({
    success: true,
    household_id: invite.household_id,
    message: `Welcome to ${household?.name || "the household"}!`,
  }, { status: 201 });
}
