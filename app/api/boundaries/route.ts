// ============================================================
// FILE: app/api/boundaries/route.ts
// PURPOSE: User boundaries — things the AI must respect
//          8 categories: topic, comparison, notification, auto_adjust, timing, tone, data, general
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import {
  validateRequiredString,
  validateOptionalString,
  validateEnum,
} from "@/lib/validation";
import type { BoundaryCategory } from "@/lib/types";

const VALID_CATEGORIES: readonly BoundaryCategory[] = [
  "topic", "comparison", "notification", "auto_adjust",
  "timing", "tone", "data", "general",
] as const;

// GET /api/boundaries — list all boundaries for current user
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const category = request.nextUrl.searchParams.get("category");

  let query = platform(supabase)
    .from("user_boundaries")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("category")
    .order("created_at");

  if (category && VALID_CATEGORIES.includes(category as BoundaryCategory)) {
    query = query.eq("category", category);
  }

  const { data: boundaries, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ boundaries: boundaries || [] });
}

// POST /api/boundaries — create a new boundary
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const catCheck = validateEnum(body.category, "category", VALID_CATEGORIES);
  if (!catCheck.valid) return NextResponse.json({ error: catCheck.error }, { status: 400 });

  const keyCheck = validateRequiredString(body.boundary_key, "boundary_key", 200);
  if (!keyCheck.valid) return NextResponse.json({ error: keyCheck.error }, { status: 400 });

  if (!body.boundary_value || typeof body.boundary_value !== "object") {
    return NextResponse.json({ error: "boundary_value must be a JSON object" }, { status: 400 });
  }

  const reasonCheck = validateOptionalString(body.reason, "reason", 500);
  if (!reasonCheck.valid) return NextResponse.json({ error: reasonCheck.error }, { status: 400 });

  const { data: boundary, error } = await platform(supabase)
    .from("user_boundaries")
    .insert({
      user_id: user.id,
      category: catCheck.value,
      boundary_key: keyCheck.value,
      boundary_value: body.boundary_value,
      reason: reasonCheck.value,
      source: body.source || "manual",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ boundary }, { status: 201 });
}
