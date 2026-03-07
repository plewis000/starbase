// GET /api/gamification/loot-boxes — List user's loot boxes
// POST /api/gamification/loot-boxes — Open a loot box

import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { openLootBox } from "@/lib/gamification";
import { isValidUUID } from "@/lib/validation";
import { config } from "@/lib/supabase/schemas";

export const GET = withUser(async (request: NextRequest, { supabase, user }) => {
  const { searchParams } = new URL(request.url);
  const unopenedOnly = searchParams.get("unopened") === "true";

  // tier FK is cross-schema (platform→config), so fetch separately
  let query = supabase
    .schema("platform")
    .from("loot_boxes")
    .select("*, reward:reward_id(name, description, icon)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (unopenedOnly) {
    query = query.eq("opened", false);
  }

  const { data: boxes, error } = await query;

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Enrich with tier data from config schema
  const tierIds = [...new Set((boxes || []).map(b => b.tier_id).filter(Boolean))];
  let tiersMap = new Map<string, { slug: string; name: string; color: string; icon: string }>();
  if (tierIds.length > 0) {
    const { data: tiers } = await config(supabase)
      .from("loot_box_tiers")
      .select("id, slug, name, color, icon")
      .in("id", tierIds);
    tiersMap = new Map((tiers || []).map(t => [t.id, { slug: t.slug, name: t.name, color: t.color, icon: t.icon }]));
  }

  const enrichedBoxes = (boxes || []).map(b => ({
    ...b,
    tier: tiersMap.get(b.tier_id) || null,
  }));

  return NextResponse.json({
    loot_boxes: enrichedBoxes,
    unopened_count: enrichedBoxes.filter(b => !b.opened).length,
  });
});

export const POST = withUser(async (request: NextRequest, { supabase, user }) => {
  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { loot_box_id } = body;

  if (!loot_box_id || !isValidUUID(loot_box_id)) {
    return NextResponse.json({ error: "loot_box_id must be a valid UUID" }, { status: 400 });
  }

  const result = await openLootBox(supabase, user.id, loot_box_id);

  if (!result) {
    return NextResponse.json(
      { error: "Loot box not found, already opened, or no rewards configured for this tier" },
      { status: 404 },
    );
  }

  return NextResponse.json({ result });
});
