// ============================================================
// FILE: app/api/life-events/route.ts
// PURPOSE: Life events — track major changes that affect behavior
//          Used by AI to adjust expectations and gamification
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
  validateOptionalNumber,
  validatePagination,
} from "@/lib/validation";
import type { LifeEventImpact } from "@/lib/types";

const VALID_IMPACTS: readonly LifeEventImpact[] = ["positive", "negative", "neutral", "mixed"] as const;

// GET /api/life-events — list life events
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  const params = request.nextUrl.searchParams;

  let query = platform(supabase)
    .from("life_events")
    .select("*", { count: "exact" });

  // Show user-specific + household-level events
  if (ctx) {
    query = query.or(
      `user_id.eq.${user.id},household_id.eq.${ctx.household_id}`
    );
  } else {
    query = query.eq("user_id", user.id);
  }

  const ongoing = params.get("ongoing");
  if (ongoing === "true") {
    query = query.eq("is_ongoing", true);
  }

  query = query.order("started_at", { ascending: false });

  const { limit, offset } = validatePagination(params.get("limit"), params.get("offset"));
  query = query.range(offset, offset + limit - 1);

  const { data: events, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: events || [], total: count || 0 });
}

// POST /api/life-events — log a new life event
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  const body = await request.json();

  const titleCheck = validateRequiredString(body.title, "title", 200);
  if (!titleCheck.valid) return NextResponse.json({ error: titleCheck.error }, { status: 400 });

  const descCheck = validateOptionalString(body.description, "description", 2000);
  if (!descCheck.valid) return NextResponse.json({ error: descCheck.error }, { status: 400 });

  const typeCheck = validateRequiredString(body.event_type, "event_type", 50);
  if (!typeCheck.valid) return NextResponse.json({ error: typeCheck.error }, { status: 400 });

  const impactCheck = validateEnum(body.impact || "neutral", "impact", VALID_IMPACTS);
  if (!impactCheck.valid) return NextResponse.json({ error: impactCheck.error }, { status: 400 });

  const xpMultCheck = validateOptionalNumber(body.xp_multiplier, "xp_multiplier", 0, 5);
  if (!xpMultCheck.valid) return NextResponse.json({ error: xpMultCheck.error }, { status: 400 });

  const { data: event, error } = await platform(supabase)
    .from("life_events")
    .insert({
      user_id: body.scope === "household" ? null : user.id,
      household_id: body.scope === "household" && ctx ? ctx.household_id : null,
      title: titleCheck.value,
      description: descCheck.value,
      event_type: typeCheck.value,
      impact: impactCheck.value,
      started_at: body.started_at || new Date().toISOString(),
      ended_at: body.ended_at || null,
      is_ongoing: body.is_ongoing !== false,
      affected_categories: body.affected_categories || null,
      xp_multiplier: xpMultCheck.value,
      ai_notes: body.ai_notes || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ event }, { status: 201 });
}
