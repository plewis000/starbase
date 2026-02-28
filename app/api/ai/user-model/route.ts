// ============================================================
// FILE: app/api/ai/user-model/route.ts
// PURPOSE: User model — versioned attributes the AI knows about each user
//          Three layers: declared, observed, inferred — with version history
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import {
  validateRequiredString,
  validateEnum,
  validateOptionalNumber,
} from "@/lib/validation";
import type { AiSourceLayer } from "@/lib/types";

const VALID_LAYERS: readonly AiSourceLayer[] = ["declared", "observed", "inferred"] as const;

// GET /api/ai/user-model — get all attributes for current user
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const layer = request.nextUrl.searchParams.get("layer");

  let query = platform(supabase)
    .from("user_model")
    .select("*")
    .eq("user_id", user.id)
    .order("attribute_key");

  if (layer && VALID_LAYERS.includes(layer as AiSourceLayer)) {
    query = query.eq("source_layer", layer);
  }

  const { data: attributes, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by key for easy consumption
  const model: Record<string, unknown> = {};
  for (const attr of (attributes || [])) {
    model[attr.attribute_key] = {
      value: attr.attribute_value,
      source: attr.source_layer,
      confidence: attr.confidence,
      version: attr.version,
      updated_at: attr.updated_at,
    };
  }

  return NextResponse.json({ model, raw: attributes || [] });
}

// POST /api/ai/user-model — upsert an attribute (creates new version if exists)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const keyCheck = validateRequiredString(body.attribute_key, "attribute_key", 100);
  if (!keyCheck.valid) return NextResponse.json({ error: keyCheck.error }, { status: 400 });

  if (!body.attribute_value || typeof body.attribute_value !== "object") {
    return NextResponse.json({ error: "attribute_value must be a JSON object" }, { status: 400 });
  }

  const layerCheck = validateEnum(body.source_layer || "declared", "source_layer", VALID_LAYERS);
  if (!layerCheck.valid) return NextResponse.json({ error: layerCheck.error }, { status: 400 });

  const confCheck = validateOptionalNumber(body.confidence, "confidence", 0, 1);
  if (!confCheck.valid) return NextResponse.json({ error: confCheck.error }, { status: 400 });

  // Check for existing attribute with this key
  const { data: existing } = await platform(supabase)
    .from("user_model")
    .select("id, version")
    .eq("user_id", user.id)
    .eq("attribute_key", keyCheck.value)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const newVersion = existing ? existing.version + 1 : 1;

  const { data: attribute, error } = await platform(supabase)
    .from("user_model")
    .insert({
      user_id: user.id,
      attribute_key: keyCheck.value,
      attribute_value: body.attribute_value,
      source_layer: layerCheck.value,
      confidence: confCheck.value ?? 0.5,
      version: newVersion,
      previous_version_id: existing?.id || null,
      updated_by: body.updated_by || "system",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ attribute }, { status: 201 });
}
