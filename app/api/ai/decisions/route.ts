// ============================================================
// FILE: app/api/ai/decisions/route.ts
// PURPOSE: AI decision log — records every AI-initiated action with reasoning
//          Enables outcome tracking and model improvement
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import {
  validateRequiredString,
  validateOptionalString,
  validatePagination,
  isValidUUID,
} from "@/lib/validation";

// GET /api/ai/decisions — list AI decisions (for transparency/audit)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;

  let query = platform(supabase)
    .from("ai_decisions")
    .select("*", { count: "exact" })
    .or(`user_id.eq.${user.id},user_id.is.null`);

  const type = params.get("type");
  if (type) {
    query = query.eq("decision_type", type);
  }

  query = query.order("created_at", { ascending: false });

  const { limit, offset } = validatePagination(params.get("limit"), params.get("offset"));
  query = query.range(offset, offset + limit - 1);

  const { data: decisions, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ decisions: decisions || [], total: count || 0 });
}

// POST /api/ai/decisions — log a new AI decision
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const typeCheck = validateRequiredString(body.decision_type, "decision_type", 100);
  if (!typeCheck.valid) return NextResponse.json({ error: typeCheck.error }, { status: 400 });

  const descCheck = validateRequiredString(body.description, "description", 2000);
  if (!descCheck.valid) return NextResponse.json({ error: descCheck.error }, { status: 400 });

  const reasonCheck = validateRequiredString(body.reasoning, "reasoning", 5000);
  if (!reasonCheck.valid) return NextResponse.json({ error: reasonCheck.error }, { status: 400 });

  const actionCheck = validateOptionalString(body.action_taken, "action_taken", 2000);
  if (!actionCheck.valid) return NextResponse.json({ error: actionCheck.error }, { status: 400 });

  const { data: decision, error } = await platform(supabase)
    .from("ai_decisions")
    .insert({
      user_id: user.id,
      household_id: body.household_id || null,
      decision_type: typeCheck.value,
      description: descCheck.value,
      reasoning: reasonCheck.value,
      action_taken: actionCheck.value,
      model_used: body.model_used || "unknown",
      tokens_used: body.tokens_used || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ decision }, { status: 201 });
}

// PATCH /api/ai/decisions — update outcome (called after seeing results)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!body.id || !isValidUUID(body.id)) {
    return NextResponse.json({ error: "Valid decision id required" }, { status: 400 });
  }

  // Verify the decision belongs to this user
  const { data: existing } = await platform(supabase)
    .from("ai_decisions")
    .select("user_id")
    .eq("id", body.id)
    .single();
  if (!existing) return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  if (existing.user_id && existing.user_id !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const updateFields: Record<string, unknown> = {};

  if ("outcome" in body) {
    const check = validateOptionalString(body.outcome, "outcome", 2000);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.outcome = check.value;
  }

  if ("outcome_score" in body) {
    if (typeof body.outcome_score !== "number" || body.outcome_score < -1 || body.outcome_score > 1) {
      return NextResponse.json({ error: "outcome_score must be between -1 and 1" }, { status: 400 });
    }
    updateFields.outcome_score = body.outcome_score;
  }

  const { data: updated, error } = await platform(supabase)
    .from("ai_decisions")
    .update(updateFields)
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ decision: updated });
}
