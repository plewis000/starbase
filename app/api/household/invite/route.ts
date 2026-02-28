// ============================================================
// FILE: app/api/household/invite/route.ts
// PURPOSE: Household invite codes — generate and list
//          Admin generates a code, partner enters it to join
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";

// Generate a simple 6-character invite code
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1 to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// GET /api/household/invite — list active invite codes (admin only)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx || ctx.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { data: invites, error } = await platform(supabase)
    .from("household_invites")
    .select("*")
    .eq("household_id", ctx.household_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ invites: invites || [] });
}

// POST /api/household/invite — generate a new invite code (admin only)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx || ctx.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  // Generate unique code (retry if collision)
  let code = generateInviteCode();
  let attempts = 0;
  while (attempts < 5) {
    const { data: existing } = await platform(supabase)
      .from("household_invites")
      .select("id")
      .eq("invite_code", code)
      .maybeSingle();

    if (!existing) break;
    code = generateInviteCode();
    attempts++;
  }

  // Validate role — only allow 'member' or 'admin'
  const validRoles = ["member", "admin"] as const;
  const role = validRoles.includes(body.role) ? body.role : "member";

  // Validate max_uses (1-10)
  const maxUses = Math.min(Math.max(1, parseInt(body.max_uses) || 1), 10);

  // Set expiry (default 7 days, max 30)
  const expireDays = Math.min(Math.max(1, parseInt(body.expires_in_days) || 7), 30);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expireDays);

  const { data: invite, error } = await platform(supabase)
    .from("household_invites")
    .insert({
      household_id: ctx.household_id,
      invite_code: code,
      created_by: user.id,
      role,
      max_uses: maxUses,
      expires_at: expiresAt.toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    invite,
    message: `Invite code: ${code} — share this with your partner. Expires in ${body.expires_in_days || 7} days.`,
  }, { status: 201 });
}
