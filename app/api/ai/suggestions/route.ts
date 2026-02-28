// ============================================================
// FILE: app/api/ai/suggestions/route.ts
// PURPOSE: AI suggestion pipeline — list and create suggestions
//          11 categories from habit tweaks to financial insights
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import {
  validateRequiredString,
  validateOptionalString,
  validateOptionalNumber,
  validateEnum,
  validatePagination,
} from "@/lib/validation";
import type { SuggestionCategory, SuggestionStatus } from "@/lib/types";

const VALID_CATEGORIES: readonly SuggestionCategory[] = [
  "habit_adjustment", "goal_suggestion", "schedule_optimization",
  "delegation_suggestion", "gamification_tweak", "responsibility_rebalance",
  "boundary_suggestion", "reward_suggestion", "notification_optimization",
  "financial_insight", "general",
] as const;

const VALID_STATUSES: readonly SuggestionStatus[] = [
  "pending", "accepted", "dismissed", "snoozed", "expired", "auto_applied",
] as const;

// GET /api/ai/suggestions — list suggestions for current user
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  const params = request.nextUrl.searchParams;

  let query = platform(supabase)
    .from("ai_suggestions")
    .select("*", { count: "exact" });

  // Show user-specific + household-level suggestions
  if (ctx) {
    query = query.or(
      `user_id.eq.${user.id},household_id.eq.${ctx.household_id}`
    );
  } else {
    query = query.eq("user_id", user.id);
  }

  // Filter by status
  const status = params.get("status");
  if (status && VALID_STATUSES.includes(status as SuggestionStatus)) {
    query = query.eq("status", status);
  } else {
    // Default: show pending only
    query = query.eq("status", "pending");
  }

  // Filter by category
  const category = params.get("category");
  if (category && VALID_CATEGORIES.includes(category as SuggestionCategory)) {
    query = query.eq("category", category);
  }

  query = query.order("priority", { ascending: false }).order("created_at", { ascending: false });

  const { limit, offset } = validatePagination(params.get("limit"), params.get("offset"));
  query = query.range(offset, offset + limit - 1);

  const { data: suggestions, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ suggestions: suggestions || [], total: count || 0 });
}

// POST /api/ai/suggestions — create a new suggestion (typically by AI batch job)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const catCheck = validateEnum(body.category || "general", "category", VALID_CATEGORIES);
  if (!catCheck.valid) return NextResponse.json({ error: catCheck.error }, { status: 400 });

  const titleCheck = validateRequiredString(body.title, "title", 300);
  if (!titleCheck.valid) return NextResponse.json({ error: titleCheck.error }, { status: 400 });

  const descCheck = validateRequiredString(body.description, "description", 2000);
  if (!descCheck.valid) return NextResponse.json({ error: descCheck.error }, { status: 400 });

  const reasonCheck = validateOptionalString(body.reasoning, "reasoning", 5000);
  if (!reasonCheck.valid) return NextResponse.json({ error: reasonCheck.error }, { status: 400 });

  const confCheck = validateOptionalNumber(body.confidence, "confidence", 0, 1);
  if (!confCheck.valid) return NextResponse.json({ error: confCheck.error }, { status: 400 });

  const priorityCheck = validateOptionalNumber(body.priority, "priority", 1, 10);
  if (!priorityCheck.valid) return NextResponse.json({ error: priorityCheck.error }, { status: 400 });

  // Only allow household_id if the user belongs to that household
  const ctx = await getHouseholdContext(supabase, user.id);
  let householdId = null;
  if (body.household_id && ctx) {
    householdId = ctx.household_id === body.household_id ? body.household_id : null;
  }

  const { data: suggestion, error } = await platform(supabase)
    .from("ai_suggestions")
    .insert({
      user_id: user.id,
      household_id: householdId,
      category: catCheck.value,
      title: titleCheck.value,
      description: descCheck.value,
      reasoning: reasonCheck.value,
      suggested_action: body.suggested_action || null,
      priority: priorityCheck.value ?? 5,
      confidence: confCheck.value ?? 0.5,
      status: "pending",
      source_observation_ids: body.source_observation_ids || null,
      expires_at: body.expires_at || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ suggestion }, { status: 201 });
}
