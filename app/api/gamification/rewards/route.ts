// GET /api/gamification/rewards — List loot box reward pool
// POST /api/gamification/rewards — Add reward to pool
// PATCH /api/gamification/rewards — Update reward
// DELETE /api/gamification/rewards — Remove reward

import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { isValidUUID } from "@/lib/validation";

export const GET = withUser(async (request: NextRequest, { supabase, user }) => {
  const { searchParams } = new URL(request.url);
  const tierId = searchParams.get("tier_id");

  let query = supabase
    .schema("platform")
    .from("loot_box_rewards")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (tierId) {
    query = query.eq("tier_id", tierId);
  }

  const { data: rewards, error } = await query;

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Tiers are in config schema — fetch separately (cross-schema FK join not supported)
  const { data: tiers } = await supabase
    .schema("config")
    .from("loot_box_tiers")
    .select("*")
    .order("sort_order");

  const tiersMap = new Map((tiers || []).map(t => [t.id, { slug: t.slug, name: t.name, color: t.color, icon: t.icon }]));
  const enrichedRewards = (rewards || []).map(r => ({ ...r, tier: tiersMap.get(r.tier_id) || null }));

  return NextResponse.json({ rewards: enrichedRewards, tiers: tiers || [] });
});

export const POST = withUser(async (request: NextRequest, { supabase, user }) => {
  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { tier_id, name, description, icon, is_household } = body;

  if (!tier_id || !isValidUUID(tier_id)) {
    return NextResponse.json({ error: "tier_id must be a valid UUID" }, { status: 400 });
  }
  if (!name || typeof name !== "string" || !name.trim() || name.trim().length > 200) {
    return NextResponse.json({ error: "name is required (max 200 chars)" }, { status: 400 });
  }

  const { data: reward, error } = await supabase
    .schema("platform")
    .from("loot_box_rewards")
    .insert({
      user_id: user.id,
      tier_id,
      name: name.trim(),
      description: description?.trim() || null,
      icon: icon || null,
      is_household: !!is_household,
    })
    .select("*")
    .single();

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Enrich with tier data
  const { data: tier } = await supabase.schema("config").from("loot_box_tiers").select("slug, name, color, icon").eq("id", tier_id).single();

  return NextResponse.json({ reward: { ...reward, tier: tier || null } }, { status: 201 });
});

export const PATCH = withUser(async (request: NextRequest, { supabase, user }) => {
  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { id, name, description, icon, is_household, active } = body;

  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (icon !== undefined) updates.icon = icon || null;
  if (is_household !== undefined) updates.is_household = !!is_household;
  if (active !== undefined) updates.active = !!active;
  if (body.tier_id !== undefined && isValidUUID(body.tier_id)) updates.tier_id = body.tier_id;

  const { data: reward, error } = await supabase
    .schema("platform")
    .from("loot_box_rewards")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Enrich with tier data
  const { data: tier } = await supabase.schema("config").from("loot_box_tiers").select("slug, name, color, icon").eq("id", reward.tier_id).single();

  return NextResponse.json({ reward: { ...reward, tier: tier || null } });
});

export const DELETE = withUser(async (request: NextRequest, { supabase, user }) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
  }

  const { error } = await supabase
    .schema("platform")
    .from("loot_box_rewards")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
});
