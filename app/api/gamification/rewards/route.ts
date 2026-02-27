// GET /api/gamification/rewards — List loot box reward pool
// POST /api/gamification/rewards — Add reward to pool
// PATCH /api/gamification/rewards — Update reward
// DELETE /api/gamification/rewards — Remove reward

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tierId = searchParams.get("tier_id");

  let query = supabase
    .schema("platform")
    .from("loot_box_rewards")
    .select("*, tier:tier_id(slug, name, color, icon)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (tierId) {
    query = query.eq("tier_id", tierId);
  }

  const { data: rewards, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also get tiers for reference
  const { data: tiers } = await supabase
    .schema("config")
    .from("loot_box_tiers")
    .select("*")
    .order("sort_order");

  return NextResponse.json({ rewards: rewards || [], tiers: tiers || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { tier_id, name, description, icon, is_household } = body;

  if (!tier_id || !name?.trim()) {
    return NextResponse.json({ error: "tier_id and name required" }, { status: 400 });
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
    .select("*, tier:tier_id(slug, name, color, icon)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reward }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, name, description, icon, is_household, active } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (icon !== undefined) updates.icon = icon || null;
  if (is_household !== undefined) updates.is_household = !!is_household;
  if (active !== undefined) updates.active = !!active;

  const { data: reward, error } = await supabase
    .schema("platform")
    .from("loot_box_rewards")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reward });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase
    .schema("platform")
    .from("loot_box_rewards")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
