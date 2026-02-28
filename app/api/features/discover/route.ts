// ============================================================
// FILE: app/api/features/discover/route.ts
// PURPOSE: Track feature area discoveries. Each feature area is
//          a "room" in the dungeon that the crawler discovers.
//          First visit triggers The System's announcement.
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";

// The rooms of the Desperado Club
export const FEATURE_AREAS = [
  "tasks",       // The Task Board
  "habits",      // The Training Grounds
  "goals",       // The War Room
  "budget",      // The Vault
  "shopping",    // The Quartermaster
  "crawl",       // The Hall of Records
  "chat",        // The Outreach Office
  "notifications", // The Message Board
  "settings",    // The Registry
] as const;

export type FeatureArea = typeof FEATURE_AREAS[number];

// GET /api/features/discover — get all discovered features for current user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: events } = await platform(supabase)
    .from("engagement_events")
    .select("feature, created_at")
    .eq("user_id", user.id)
    .eq("event_type", "feature_discovery")
    .order("created_at", { ascending: true });

  const discovered = new Map<string, string>();
  for (const e of (events || [])) {
    if (e.feature && !discovered.has(e.feature)) {
      discovered.set(e.feature, e.created_at);
    }
  }

  const features = FEATURE_AREAS.map((area) => ({
    area,
    discovered: discovered.has(area),
    discovered_at: discovered.get(area) || null,
  }));

  return NextResponse.json({
    features,
    total_discovered: discovered.size,
    total_available: FEATURE_AREAS.length,
    progress: Math.round((discovered.size / FEATURE_AREAS.length) * 100),
  });
}

// POST /api/features/discover — mark a feature as discovered (first visit)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const feature = body.feature as string;

  if (!feature || !FEATURE_AREAS.includes(feature as FeatureArea)) {
    return NextResponse.json({
      error: `feature must be one of: ${FEATURE_AREAS.join(", ")}`,
    }, { status: 400 });
  }

  // Check if already discovered
  const { data: existing } = await platform(supabase)
    .from("engagement_events")
    .select("id")
    .eq("user_id", user.id)
    .eq("event_type", "feature_discovery")
    .eq("feature", feature)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({
      already_discovered: true,
      feature,
    });
  }

  // Record the discovery
  await platform(supabase)
    .from("engagement_events")
    .insert({
      user_id: user.id,
      event_type: "feature_discovery",
      feature,
      metadata: { first_visit: true },
    });

  // Count total discoveries for XP milestone check
  const { count } = await platform(supabase)
    .from("engagement_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("event_type", "feature_discovery");

  return NextResponse.json({
    discovered: true,
    feature,
    total_discovered: (count || 0),
    is_new: true,
  }, { status: 201 });
}
