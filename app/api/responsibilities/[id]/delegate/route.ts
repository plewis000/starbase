// ============================================================
// FILE: app/api/responsibilities/[id]/delegate/route.ts
// PURPOSE: Delegation workflow — create, accept, decline, complete
//          This is the DEEP delegation system. Supports temporary,
//          permanent, and one-time transfers with full status workflow.
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import {
  isValidUUID,
  validateRequiredUUID,
  validateOptionalString,
  validateOptionalDate,
  validateEnum,
} from "@/lib/validation";
import { triggerNotification } from "@/lib/notify";
import type { DelegationType, DelegationStatus } from "@/lib/types";

const VALID_DELEGATION_TYPES: readonly DelegationType[] = ["temporary", "permanent", "one_time"] as const;

// GET /api/responsibilities/[id]/delegate — list all delegations for this responsibility
export async function GET(
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

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({ error: "No household found" }, { status: 404 });
  }

  const statusFilter = request.nextUrl.searchParams.get("status");

  let query = platform(supabase)
    .from("delegations")
    .select("*")
    .eq("responsibility_id", id)
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: delegations, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ delegations: delegations || [] });
}

// POST /api/responsibilities/[id]/delegate — create a new delegation request
export async function POST(
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

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({ error: "No household found" }, { status: 404 });
  }

  // Verify responsibility exists and belongs to household
  const { data: responsibility } = await platform(supabase)
    .from("responsibilities")
    .select("id, name, current_owner_id, household_id, icon")
    .eq("id", id)
    .eq("household_id", ctx.household_id)
    .single();

  if (!responsibility) {
    return NextResponse.json({ error: "Responsibility not found" }, { status: 404 });
  }

  // Only the current owner can delegate (or admin)
  if (responsibility.current_owner_id !== user.id && ctx.role !== "admin") {
    return NextResponse.json(
      { error: "Only the current owner or an admin can delegate" },
      { status: 403 }
    );
  }

  // Check for existing active delegation
  const { data: activeDelegation } = await platform(supabase)
    .from("delegations")
    .select("id")
    .eq("responsibility_id", id)
    .in("status", ["pending", "accepted", "active"])
    .maybeSingle();

  if (activeDelegation) {
    return NextResponse.json(
      { error: "This responsibility already has an active delegation. Complete or cancel it first." },
      { status: 409 }
    );
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // Validate fields
  const toUserCheck = validateRequiredUUID(body.to_user_id, "to_user_id");
  if (!toUserCheck.valid) return NextResponse.json({ error: toUserCheck.error }, { status: 400 });

  if (toUserCheck.value === user.id) {
    return NextResponse.json({ error: "Cannot delegate to yourself" }, { status: 400 });
  }

  // Verify target user is in the same household
  const { data: targetMember } = await platform(supabase)
    .from("household_members")
    .select("user_id")
    .eq("household_id", ctx.household_id)
    .eq("user_id", toUserCheck.value)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: "Target user is not in your household" }, { status: 400 });
  }

  const typeCheck = validateEnum(
    body.delegation_type || "temporary",
    "delegation_type",
    VALID_DELEGATION_TYPES
  );
  if (!typeCheck.valid) return NextResponse.json({ error: typeCheck.error }, { status: 400 });

  const reasonCheck = validateOptionalString(body.reason, "reason", 500);
  if (!reasonCheck.valid) return NextResponse.json({ error: reasonCheck.error }, { status: 400 });

  const startsCheck = validateOptionalDate(body.starts_at, "starts_at");
  if (!startsCheck.valid) return NextResponse.json({ error: startsCheck.error }, { status: 400 });

  const endsCheck = validateOptionalDate(body.ends_at, "ends_at");
  if (!endsCheck.valid) return NextResponse.json({ error: endsCheck.error }, { status: 400 });

  // Temporary delegations should have an end date
  if (typeCheck.value === "temporary" && !endsCheck.value) {
    return NextResponse.json(
      { error: "Temporary delegations require an ends_at date" },
      { status: 400 }
    );
  }

  const { data: delegation, error } = await platform(supabase)
    .from("delegations")
    .insert({
      responsibility_id: id,
      from_user_id: user.id,
      to_user_id: toUserCheck.value,
      delegation_type: typeCheck.value,
      status: "pending",
      reason: reasonCheck.value,
      starts_at: startsCheck.value,
      ends_at: endsCheck.value,
      source: "manual",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify the target user
  await triggerNotification(supabase, {
    recipientUserId: toUserCheck.value,
    title: `${responsibility.name} — delegation request`,
    body: reasonCheck.value || `You've been asked to take over "${responsibility.name}"`,
    event: "task_handed_off",
    metadata: { entity_type: "responsibility", entity_id: id },
  });

  // Log in history
  await platform(supabase)
    .from("responsibility_history")
    .insert({
      responsibility_id: id,
      user_id: user.id,
      action: "delegated",
      previous_owner_id: user.id,
      new_owner_id: toUserCheck.value,
      reason: reasonCheck.value || `Delegated (${typeCheck.value})`,
      source: "manual",
    });

  return NextResponse.json({ delegation }, { status: 201 });
}
