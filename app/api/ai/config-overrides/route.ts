// ============================================================
// FILE: app/api/ai/config-overrides/route.ts
// PURPOSE: Config override layer — AI writes overrides, not base config
//          Per-user or per-household scope. Natural language audit trail.
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import {
  validateRequiredString,
  validateOptionalString,
  validateEnum,
  isValidUUID,
  validatePagination,
} from "@/lib/validation";
import type { ConfigOverrideScope } from "@/lib/types";

const VALID_SCOPES: readonly ConfigOverrideScope[] = ["user", "household"] as const;

// GET /api/ai/config-overrides — list active overrides for current user/household
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  const params = request.nextUrl.searchParams;

  // Build filter: user-scoped + household-scoped overrides
  let query = platform(supabase)
    .from("config_overrides")
    .select("*", { count: "exact" });

  if (ctx) {
    query = query.or(
      `and(scope.eq.user,scope_id.eq.${user.id}),and(scope.eq.household,scope_id.eq.${ctx.household_id})`
    );
  } else {
    query = query.eq("scope", "user").eq("scope_id", user.id);
  }

  const activeOnly = params.get("active") !== "false";
  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const configKey = params.get("config_key");
  if (configKey) {
    query = query.eq("config_key", configKey);
  }

  query = query.order("created_at", { ascending: false });

  const { limit, offset } = validatePagination(params.get("limit"), params.get("offset"));
  query = query.range(offset, offset + limit - 1);

  const { data: overrides, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ overrides: overrides || [], total: count || 0 });
}

// POST /api/ai/config-overrides — create or update a config override
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  const body = await request.json();

  const keyCheck = validateRequiredString(body.config_key, "config_key", 200);
  if (!keyCheck.valid) return NextResponse.json({ error: keyCheck.error }, { status: 400 });

  if (!body.config_value || typeof body.config_value !== "object") {
    return NextResponse.json({ error: "config_value must be a JSON object" }, { status: 400 });
  }

  const scopeCheck = validateEnum(body.scope || "user", "scope", VALID_SCOPES);
  if (!scopeCheck.valid) return NextResponse.json({ error: scopeCheck.error }, { status: 400 });

  const reasonCheck = validateOptionalString(body.reason, "reason", 1000);
  if (!reasonCheck.valid) return NextResponse.json({ error: reasonCheck.error }, { status: 400 });

  const instructionCheck = validateOptionalString(body.original_instruction, "original_instruction", 2000);
  if (!instructionCheck.valid) return NextResponse.json({ error: instructionCheck.error }, { status: 400 });

  // Determine scope_id
  let scopeId: string;
  if (scopeCheck.value === "household") {
    if (!ctx) {
      return NextResponse.json({ error: "No household found for household-scoped override" }, { status: 400 });
    }
    scopeId = ctx.household_id;
  } else {
    scopeId = user.id;
  }

  // Check for existing active override with same key+scope
  const { data: existing } = await platform(supabase)
    .from("config_overrides")
    .select("id, config_value")
    .eq("config_key", keyCheck.value)
    .eq("scope", scopeCheck.value)
    .eq("scope_id", scopeId)
    .eq("is_active", true)
    .maybeSingle();

  const oldValue = existing?.config_value || null;

  if (existing) {
    // Update existing override
    const { data: updated, error } = await platform(supabase)
      .from("config_overrides")
      .update({
        config_value: body.config_value,
        reason: reasonCheck.value,
        original_instruction: instructionCheck.value,
        set_by: body.set_by || "system",
        expires_at: body.expires_at || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the change
    await platform(supabase)
      .from("config_change_log")
      .insert({
        override_id: existing.id,
        action: "updated",
        config_key: keyCheck.value,
        old_value: oldValue,
        new_value: body.config_value,
        natural_language_description:
          instructionCheck.value || reasonCheck.value || `Updated ${keyCheck.value}`,
        performed_by: body.set_by || "system",
      });

    return NextResponse.json({ override: updated });
  }

  // Create new override
  const { data: override, error } = await platform(supabase)
    .from("config_overrides")
    .insert({
      scope: scopeCheck.value,
      scope_id: scopeId,
      config_key: keyCheck.value,
      config_value: body.config_value,
      reason: reasonCheck.value,
      original_instruction: instructionCheck.value,
      set_by: body.set_by || "system",
      expires_at: body.expires_at || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log creation
  await platform(supabase)
    .from("config_change_log")
    .insert({
      override_id: override.id,
      action: "created",
      config_key: keyCheck.value,
      old_value: null,
      new_value: body.config_value,
      natural_language_description:
        instructionCheck.value || reasonCheck.value || `Created override for ${keyCheck.value}`,
      performed_by: body.set_by || "system",
    });

  return NextResponse.json({ override }, { status: 201 });
}

// DELETE /api/ai/config-overrides?id=xxx — deactivate an override
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const overrideId = request.nextUrl.searchParams.get("id");
  if (!overrideId || !isValidUUID(overrideId)) {
    return NextResponse.json({ error: "Valid override id required" }, { status: 400 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);

  // Fetch override and verify ownership
  const { data: override } = await platform(supabase)
    .from("config_overrides")
    .select("config_key, config_value, scope, scope_id")
    .eq("id", overrideId)
    .single();

  if (!override) {
    return NextResponse.json({ error: "Override not found" }, { status: 404 });
  }

  // Verify the user owns this override
  const isOwner = (override.scope === "user" && override.scope_id === user.id) ||
    (override.scope === "household" && ctx && override.scope_id === ctx.household_id);
  if (!isOwner) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { error } = await platform(supabase)
    .from("config_overrides")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", overrideId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log deactivation
  if (override) {
    await platform(supabase)
      .from("config_change_log")
      .insert({
        override_id: overrideId,
        action: "deactivated",
        config_key: override.config_key,
        old_value: override.config_value,
        new_value: null,
        natural_language_description: `Deactivated override for ${override.config_key}`,
        performed_by: "user",
      });
  }

  return NextResponse.json({ success: true });
}
