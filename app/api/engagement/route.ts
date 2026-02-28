// ============================================================
// FILE: app/api/engagement/route.ts
// PURPOSE: Lightweight engagement tracking — feature usage events
//          The AI reads this to learn what's working and what's not
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { validateRequiredString, validateOptionalString, isValidUUID } from "@/lib/validation";

// POST /api/engagement — track a feature usage event
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const typeCheck = validateRequiredString(body.event_type, "event_type", 100);
  if (!typeCheck.valid) return NextResponse.json({ error: typeCheck.error }, { status: 400 });

  const featureCheck = validateOptionalString(body.feature, "feature", 100);
  if (!featureCheck.valid) return NextResponse.json({ error: featureCheck.error }, { status: 400 });

  // Validate entity_type (whitelist common types)
  const validEntityTypes = ["task", "habit", "goal", "shopping_list", "conversation", "notification", "feedback", "page"];
  const entityType = body.entity_type && validEntityTypes.includes(body.entity_type)
    ? body.entity_type : null;

  // Validate entity_id if provided
  const entityId = body.entity_id && isValidUUID(body.entity_id) ? body.entity_id : null;

  // Validate metadata size
  if (body.metadata && JSON.stringify(body.metadata).length > 5000) {
    return NextResponse.json({ error: "metadata too large (max 5KB)" }, { status: 400 });
  }

  const { error } = await platform(supabase)
    .from("engagement_events")
    .insert({
      user_id: user.id,
      event_type: typeCheck.value,
      feature: featureCheck.value,
      entity_type: entityType,
      entity_id: entityId,
      metadata: body.metadata || null,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
