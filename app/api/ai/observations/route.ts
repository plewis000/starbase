// ============================================================
// FILE: app/api/ai/observations/route.ts
// PURPOSE: AI observation CRUD — what the system notices about users
//          Three layers: declared (user said), observed (AI saw), inferred (AI concluded)
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import {
  validateRequiredString,
  validateOptionalString,
  validateOptionalUUID,
  validateOptionalNumber,
  validateEnum,
  validatePagination,
} from "@/lib/validation";
import type { AiSourceLayer } from "@/lib/types";

const VALID_LAYERS: readonly AiSourceLayer[] = ["declared", "observed", "inferred"] as const;

// GET /api/ai/observations — list observations for current user
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;

  let query = platform(supabase)
    .from("ai_observations")
    .select("*", { count: "exact" })
    .eq("user_id", user.id);

  // Filter by active status
  const activeOnly = params.get("active") !== "false";
  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  // Filter by source layer
  const layer = params.get("layer");
  if (layer && VALID_LAYERS.includes(layer as AiSourceLayer)) {
    query = query.eq("source_layer", layer);
  }

  // Filter by type
  const type = params.get("type");
  if (type) {
    query = query.eq("observation_type", type);
  }

  query = query.order("created_at", { ascending: false });

  const { limit, offset } = validatePagination(params.get("limit"), params.get("offset"));
  query = query.range(offset, offset + limit - 1);

  const { data: observations, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ observations: observations || [], total: count || 0 });
}

// POST /api/ai/observations — create a new observation (typically called by AI/system)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const typeCheck = validateRequiredString(body.observation_type, "observation_type", 100);
  if (!typeCheck.valid) return NextResponse.json({ error: typeCheck.error }, { status: 400 });

  const contentCheck = validateRequiredString(body.content, "content", 5000);
  if (!contentCheck.valid) return NextResponse.json({ error: contentCheck.error }, { status: 400 });

  const layerCheck = validateEnum(body.source_layer || "observed", "source_layer", VALID_LAYERS);
  if (!layerCheck.valid) return NextResponse.json({ error: layerCheck.error }, { status: 400 });

  const confCheck = validateOptionalNumber(body.confidence, "confidence", 0, 1);
  if (!confCheck.valid) return NextResponse.json({ error: confCheck.error }, { status: 400 });

  const supersedesCheck = validateOptionalUUID(body.supersedes_id, "supersedes_id");
  if (!supersedesCheck.valid) return NextResponse.json({ error: supersedesCheck.error }, { status: 400 });

  // If superseding another observation, deactivate the old one
  if (supersedesCheck.value) {
    await platform(supabase)
      .from("ai_observations")
      .update({ is_active: false })
      .eq("id", supersedesCheck.value);
  }

  const { data: observation, error } = await platform(supabase)
    .from("ai_observations")
    .insert({
      user_id: user.id,
      household_id: body.household_id || null,
      observation_type: typeCheck.value,
      content: contentCheck.value,
      confidence: confCheck.value ?? 0.5,
      source_layer: layerCheck.value,
      source_data: body.source_data || null,
      tags: body.tags || null,
      supersedes_id: supersedesCheck.value,
      expires_at: body.expires_at || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ observation }, { status: 201 });
}
