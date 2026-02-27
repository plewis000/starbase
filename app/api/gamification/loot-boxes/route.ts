// GET /api/gamification/loot-boxes — List user's loot boxes
// POST /api/gamification/loot-boxes — Open a loot box

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openLootBox } from "@/lib/gamification";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const unopenedOnly = searchParams.get("unopened") === "true";

  let query = supabase
    .schema("platform")
    .from("loot_boxes")
    .select("*, tier:tier_id(slug, name, color, icon), reward:reward_id(name, description, icon)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (unopenedOnly) {
    query = query.eq("opened", false);
  }

  const { data: boxes, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    loot_boxes: boxes || [],
    unopened_count: (boxes || []).filter(b => !b.opened).length,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { loot_box_id } = body;

  if (!loot_box_id) {
    return NextResponse.json({ error: "loot_box_id required" }, { status: 400 });
  }

  const result = await openLootBox(supabase, user.id, loot_box_id);

  if (!result) {
    return NextResponse.json(
      { error: "Loot box not found, already opened, or no rewards configured for this tier" },
      { status: 404 },
    );
  }

  return NextResponse.json({ result });
}
