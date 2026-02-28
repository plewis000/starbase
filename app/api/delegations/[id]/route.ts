// ============================================================
// FILE: app/api/delegations/[id]/route.ts
// PURPOSE: Delegation status management — accept, decline, complete, cancel
//          Handles the full delegation lifecycle with ownership transfer
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import { isValidUUID, validateEnum, validateOptionalString } from "@/lib/validation";
import { triggerNotification } from "@/lib/notify";

type DelegationAction = "accept" | "decline" | "complete" | "cancel";
const VALID_ACTIONS: readonly DelegationAction[] = ["accept", "decline", "complete", "cancel"] as const;

// GET /api/delegations/[id] — get delegation detail
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

  const { data: delegation, error } = await platform(supabase)
    .from("delegations")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !delegation) {
    return NextResponse.json({ error: "Delegation not found" }, { status: 404 });
  }

  // Fetch the responsibility name for context
  const { data: responsibility } = await platform(supabase)
    .from("responsibilities")
    .select("id, name, icon, category")
    .eq("id", delegation.responsibility_id)
    .single();

  return NextResponse.json({
    delegation: {
      ...delegation,
      responsibility: responsibility || null,
    },
  });
}

// PATCH /api/delegations/[id] — transition delegation status
// Body: { action: "accept" | "decline" | "complete" | "cancel", reason?: string }
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

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const actionCheck = validateEnum(body.action, "action", VALID_ACTIONS);
  if (!actionCheck.valid) return NextResponse.json({ error: actionCheck.error }, { status: 400 });

  const reasonCheck = validateOptionalString(body.reason, "reason", 500);
  if (!reasonCheck.valid) return NextResponse.json({ error: reasonCheck.error }, { status: 400 });

  // Fetch current delegation
  const { data: delegation, error: fetchErr } = await platform(supabase)
    .from("delegations")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !delegation) {
    return NextResponse.json({ error: "Delegation not found" }, { status: 404 });
  }

  const action = actionCheck.value;
  const now = new Date().toISOString();

  // Validate action permissions and state transitions
  switch (action) {
    case "accept": {
      // Only the target user can accept
      if (delegation.to_user_id !== user.id) {
        return NextResponse.json({ error: "Only the delegatee can accept" }, { status: 403 });
      }
      if (delegation.status !== "pending") {
        return NextResponse.json({ error: "Can only accept pending delegations" }, { status: 400 });
      }

      // Update delegation status
      await platform(supabase)
        .from("delegations")
        .update({ status: "active", accepted_at: now })
        .eq("id", id);

      // Transfer ownership on the responsibility
      await platform(supabase)
        .from("responsibilities")
        .update({
          current_owner_id: delegation.to_user_id,
          updated_at: now,
        })
        .eq("id", delegation.responsibility_id);

      // Log ownership change
      await platform(supabase)
        .from("responsibility_history")
        .insert({
          responsibility_id: delegation.responsibility_id,
          user_id: user.id,
          action: "delegated",
          previous_owner_id: delegation.from_user_id,
          new_owner_id: delegation.to_user_id,
          reason: `Delegation accepted${reasonCheck.value ? `: ${reasonCheck.value}` : ""}`,
          source: "delegation",
        });

      // Notify the delegator
      await triggerNotification(supabase, {
        recipientUserId: delegation.from_user_id,
        title: "Delegation accepted",
        body: "Your delegation request was accepted",
        event: "task_handed_off",
        metadata: { entity_type: "responsibility", entity_id: delegation.responsibility_id },
      });

      break;
    }

    case "decline": {
      // Only the target user can decline
      if (delegation.to_user_id !== user.id) {
        return NextResponse.json({ error: "Only the delegatee can decline" }, { status: 403 });
      }
      if (delegation.status !== "pending") {
        return NextResponse.json({ error: "Can only decline pending delegations" }, { status: 400 });
      }

      await platform(supabase)
        .from("delegations")
        .update({ status: "declined", completed_at: now })
        .eq("id", id);

      // Notify the delegator
      await triggerNotification(supabase, {
        recipientUserId: delegation.from_user_id,
        title: "Delegation declined",
        body: reasonCheck.value || "Your delegation request was declined",
        event: "task_handed_off",
        metadata: { entity_type: "responsibility", entity_id: delegation.responsibility_id },
      });

      break;
    }

    case "complete": {
      // Either party can mark as complete (for temporary delegations)
      if (delegation.from_user_id !== user.id && delegation.to_user_id !== user.id) {
        return NextResponse.json({ error: "Only involved parties can complete" }, { status: 403 });
      }
      if (delegation.status !== "active") {
        return NextResponse.json({ error: "Can only complete active delegations" }, { status: 400 });
      }

      await platform(supabase)
        .from("delegations")
        .update({ status: "completed", completed_at: now })
        .eq("id", id);

      // For temporary/one_time delegations, return ownership to the original owner
      if (delegation.delegation_type !== "permanent") {
        await platform(supabase)
          .from("responsibilities")
          .update({
            current_owner_id: delegation.from_user_id,
            updated_at: now,
          })
          .eq("id", delegation.responsibility_id);

        await platform(supabase)
          .from("responsibility_history")
          .insert({
            responsibility_id: delegation.responsibility_id,
            user_id: user.id,
            action: "reclaimed",
            previous_owner_id: delegation.to_user_id,
            new_owner_id: delegation.from_user_id,
            reason: `Delegation completed — ownership returned`,
            source: "delegation",
          });
      }

      // Notify the other party
      const notifyUserId = user.id === delegation.from_user_id
        ? delegation.to_user_id
        : delegation.from_user_id;

      await triggerNotification(supabase, {
        recipientUserId: notifyUserId,
        title: "Delegation completed",
        body: "A delegation has been marked as complete",
        event: "task_handed_off",
        metadata: { entity_type: "responsibility", entity_id: delegation.responsibility_id },
      });

      break;
    }

    case "cancel": {
      // Only the delegator or admin can cancel
      if (delegation.from_user_id !== user.id && ctx.role !== "admin") {
        return NextResponse.json({ error: "Only the delegator or admin can cancel" }, { status: 403 });
      }
      if (!["pending", "accepted", "active"].includes(delegation.status)) {
        return NextResponse.json({ error: "Cannot cancel a completed or already cancelled delegation" }, { status: 400 });
      }

      await platform(supabase)
        .from("delegations")
        .update({ status: "cancelled", completed_at: now })
        .eq("id", id);

      // If ownership was transferred, revert it
      if (["accepted", "active"].includes(delegation.status)) {
        await platform(supabase)
          .from("responsibilities")
          .update({
            current_owner_id: delegation.from_user_id,
            updated_at: now,
          })
          .eq("id", delegation.responsibility_id);

        await platform(supabase)
          .from("responsibility_history")
          .insert({
            responsibility_id: delegation.responsibility_id,
            user_id: user.id,
            action: "reclaimed",
            previous_owner_id: delegation.to_user_id,
            new_owner_id: delegation.from_user_id,
            reason: `Delegation cancelled${reasonCheck.value ? `: ${reasonCheck.value}` : ""}`,
            source: "delegation",
          });
      }

      // Notify the other party
      await triggerNotification(supabase, {
        recipientUserId: delegation.to_user_id,
        title: "Delegation cancelled",
        body: reasonCheck.value || "A delegation has been cancelled",
        event: "task_handed_off",
        metadata: { entity_type: "responsibility", entity_id: delegation.responsibility_id },
      });

      break;
    }
  }

  // Fetch updated delegation
  const { data: updated } = await platform(supabase)
    .from("delegations")
    .select("*")
    .eq("id", id)
    .single();

  return NextResponse.json({ delegation: updated });
}
