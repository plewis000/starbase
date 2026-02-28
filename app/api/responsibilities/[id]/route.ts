// ============================================================
// FILE: app/api/responsibilities/[id]/route.ts
// PURPOSE: Single responsibility — get detail, update, delete, reassign
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import {
  isValidUUID,
  validateRequiredString,
  validateOptionalString,
  validateOptionalUUID,
  validateEnum,
  validatePositiveInt,
} from "@/lib/validation";
import type { OwnershipType } from "@/lib/types";

const VALID_OWNERSHIP_TYPES: readonly OwnershipType[] = ["fixed", "rotating", "shared", "flexible"] as const;

// GET /api/responsibilities/[id] — full detail with history, links, active delegation
export async function GET(
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

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({ error: "No household found" }, { status: 404 });
  }

  // Fetch responsibility
  const { data: responsibility, error } = await platform(supabase)
    .from("responsibilities")
    .select("*")
    .eq("id", id)
    .eq("household_id", ctx.household_id)
    .single();

  if (error || !responsibility) {
    return NextResponse.json({ error: "Responsibility not found" }, { status: 404 });
  }

  // Fetch history (last 20 entries)
  const { data: history } = await platform(supabase)
    .from("responsibility_history")
    .select("*")
    .eq("responsibility_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Fetch linked entities
  const { data: links } = await platform(supabase)
    .from("responsibility_links")
    .select("*")
    .eq("responsibility_id", id);

  // Fetch active delegation (if any)
  const { data: activeDelegation } = await platform(supabase)
    .from("delegations")
    .select("*")
    .eq("responsibility_id", id)
    .in("status", ["pending", "accepted", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    responsibility: {
      ...responsibility,
      history: history || [],
      linked_entities: links || [],
      active_delegation: activeDelegation || null,
    },
  });
}

// PATCH /api/responsibilities/[id] — update responsibility fields or reassign
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

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({ error: "No household found" }, { status: 404 });
  }

  // Fetch current state
  const { data: current, error: fetchErr } = await platform(supabase)
    .from("responsibilities")
    .select("*")
    .eq("id", id)
    .eq("household_id", ctx.household_id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Responsibility not found" }, { status: 404 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const updateFields: Record<string, unknown> = {};

  // Validate updatable fields
  if ("name" in body) {
    const check = validateRequiredString(body.name, "name", 200);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.name = check.value;
  }

  if ("description" in body) {
    const check = validateOptionalString(body.description, "description", 1000);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.description = check.value;
  }

  if ("category" in body) {
    const check = validateRequiredString(body.category, "category", 50);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.category = check.value;
  }

  if ("ownership_type" in body) {
    const check = validateEnum(body.ownership_type, "ownership_type", VALID_OWNERSHIP_TYPES);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.ownership_type = check.value;
  }

  if ("effort_weight" in body) {
    const check = validatePositiveInt(body.effort_weight, "effort_weight", 1, 10);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.effort_weight = check.value;
  }

  if ("default_recurrence" in body) {
    const check = validateOptionalString(body.default_recurrence, "default_recurrence", 50);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.default_recurrence = check.value;
  }

  if ("icon" in body) {
    updateFields.icon = body.icon || null;
  }

  if ("rotate_every_days" in body) {
    const check = validatePositiveInt(body.rotate_every_days, "rotate_every_days", 1, 365);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.rotate_every_days = check.value;
  }

  // Handle reassignment (owner change)
  if ("current_owner_id" in body) {
    const check = validateOptionalUUID(body.current_owner_id, "current_owner_id");
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });

    if (check.value && check.value !== current.current_owner_id) {
      updateFields.current_owner_id = check.value;

      // Log the reassignment
      await platform(supabase)
        .from("responsibility_history")
        .insert({
          responsibility_id: id,
          user_id: user.id,
          action: "assigned",
          previous_owner_id: current.current_owner_id,
          new_owner_id: check.value,
          reason: body.reassign_reason || "Manual reassignment",
          source: "manual",
        });
    }
  }

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updateFields.updated_at = new Date().toISOString();

  const { data: updated, error: updateErr } = await platform(supabase)
    .from("responsibilities")
    .update(updateFields)
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ responsibility: updated });
}

// DELETE /api/responsibilities/[id] — delete a responsibility
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

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({ error: "No household found" }, { status: 404 });
  }

  const { error } = await platform(supabase)
    .from("responsibilities")
    .delete()
    .eq("id", id)
    .eq("household_id", ctx.household_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
