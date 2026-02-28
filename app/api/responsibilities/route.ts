// ============================================================
// FILE: app/api/responsibilities/route.ts
// PURPOSE: Responsibility CRUD — list and create household responsibilities
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import {
  validateRequiredString,
  validateOptionalString,
  validateOptionalUUID,
  validateEnum,
  validatePositiveInt,
  validatePagination,
  sanitizeSearchInput,
} from "@/lib/validation";
import type { OwnershipType } from "@/lib/types";

const VALID_OWNERSHIP_TYPES: readonly OwnershipType[] = ["fixed", "rotating", "shared", "flexible"] as const;

// GET /api/responsibilities — list all household responsibilities
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({ error: "No household found" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;

  let query = platform(supabase)
    .from("responsibilities")
    .select("*", { count: "exact" })
    .eq("household_id", ctx.household_id);

  // Filter by category
  const category = params.get("category");
  if (category) {
    query = query.eq("category", category);
  }

  // Filter by owner
  const ownerId = params.get("owner_id");
  if (ownerId) {
    query = query.eq("current_owner_id", ownerId);
  }

  // Filter by ownership type
  const ownershipType = params.get("ownership_type");
  if (ownershipType && VALID_OWNERSHIP_TYPES.includes(ownershipType as OwnershipType)) {
    query = query.eq("ownership_type", ownershipType);
  }

  // Search
  const search = params.get("search");
  if (search) {
    const sanitized = sanitizeSearchInput(search);
    if (sanitized.length > 0) {
      query = query.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
    }
  }

  // Sorting
  const VALID_SORTS = ["name", "effort_weight", "category", "created_at"];
  const sort = VALID_SORTS.includes(params.get("sort") || "") ? params.get("sort")! : "name";
  const ascending = params.get("order") !== "desc";
  query = query.order(sort, { ascending });

  // Pagination
  const { limit, offset } = validatePagination(params.get("limit"), params.get("offset"));
  query = query.range(offset, offset + limit - 1);

  const { data: responsibilities, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    responsibilities: responsibilities || [],
    total: count || 0,
  });
}

// POST /api/responsibilities — create a new responsibility
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({ error: "No household found" }, { status: 404 });
  }

  const body = await request.json();

  // Validate required fields
  const nameCheck = validateRequiredString(body.name, "name", 200);
  if (!nameCheck.valid) return NextResponse.json({ error: nameCheck.error }, { status: 400 });

  const categoryCheck = validateRequiredString(body.category, "category", 50);
  if (!categoryCheck.valid) return NextResponse.json({ error: categoryCheck.error }, { status: 400 });

  // Validate optional fields
  const descCheck = validateOptionalString(body.description, "description", 1000);
  if (!descCheck.valid) return NextResponse.json({ error: descCheck.error }, { status: 400 });

  const ownerCheck = validateOptionalUUID(body.current_owner_id, "current_owner_id");
  if (!ownerCheck.valid) return NextResponse.json({ error: ownerCheck.error }, { status: 400 });

  const ownershipCheck = validateEnum(
    body.ownership_type || "fixed",
    "ownership_type",
    VALID_OWNERSHIP_TYPES
  );
  if (!ownershipCheck.valid) return NextResponse.json({ error: ownershipCheck.error }, { status: 400 });

  const effortCheck = validatePositiveInt(body.effort_weight || 5, "effort_weight", 1, 10);
  if (!effortCheck.valid) return NextResponse.json({ error: effortCheck.error }, { status: 400 });

  const recurrenceCheck = validateOptionalString(body.default_recurrence, "default_recurrence", 50);
  if (!recurrenceCheck.valid) return NextResponse.json({ error: recurrenceCheck.error }, { status: 400 });

  const insertData: Record<string, unknown> = {
    household_id: ctx.household_id,
    name: nameCheck.value,
    category: categoryCheck.value,
    description: descCheck.value,
    current_owner_id: ownerCheck.value || user.id,
    ownership_type: ownershipCheck.value,
    effort_weight: effortCheck.value,
    default_recurrence: recurrenceCheck.value,
    icon: body.icon || null,
  };

  // Rotation settings for rotating ownership
  if (ownershipCheck.value === "rotating" && body.rotate_every_days) {
    const rotateCheck = validatePositiveInt(body.rotate_every_days, "rotate_every_days", 1, 365);
    if (!rotateCheck.valid) return NextResponse.json({ error: rotateCheck.error }, { status: 400 });
    insertData.rotate_every_days = rotateCheck.value;
    insertData.last_rotated_at = new Date().toISOString();
    // Calculate next rotation
    const nextRotation = new Date();
    nextRotation.setDate(nextRotation.getDate() + rotateCheck.value);
    insertData.next_rotation_at = nextRotation.toISOString();
  }

  const { data: responsibility, error } = await platform(supabase)
    .from("responsibilities")
    .insert(insertData)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log creation in history
  await platform(supabase)
    .from("responsibility_history")
    .insert({
      responsibility_id: responsibility.id,
      user_id: user.id,
      action: "created",
      new_owner_id: insertData.current_owner_id as string,
      reason: "Initial assignment",
      source: "manual",
    });

  return NextResponse.json({ responsibility }, { status: 201 });
}
