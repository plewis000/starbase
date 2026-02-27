// GET /api/gamification/achievements — List all achievements + unlock status
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const unlockedOnly = searchParams.get("unlocked") === "true";

  // Get all achievements
  let query = supabase
    .schema("config")
    .from("achievements")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  if (category) {
    query = query.eq("category", category);
  }

  const { data: achievements } = await query;

  // Get user's unlocks
  const { data: unlocks } = await supabase
    .schema("platform")
    .from("achievement_unlocks")
    .select("achievement_id, unlocked_at, xp_awarded, unlock_count")
    .eq("user_id", user.id);

  const unlockMap = new Map<string, { unlocked_at: string; xp_awarded: number; unlock_count: number }>();
  for (const u of unlocks || []) {
    unlockMap.set(u.achievement_id, u);
  }

  // Merge achievements with unlock status
  const merged = (achievements || []).map(a => {
    const unlock = unlockMap.get(a.id);
    const isUnlocked = !!unlock;

    // Hide hidden achievements that aren't unlocked
    if (a.is_hidden && !isUnlocked) {
      return {
        id: a.id,
        slug: "hidden",
        name: "???",
        description: "This achievement is hidden. Keep playing to discover it.",
        category: a.category,
        tier: a.tier,
        xp_reward: a.xp_reward,
        icon: "❓",
        is_hidden: true,
        is_party: a.is_party,
        is_repeatable: a.is_repeatable,
        unlocked: false,
        unlocked_at: null,
        unlock_count: 0,
      };
    }

    return {
      id: a.id,
      slug: a.slug,
      name: a.name,
      description: a.description,
      category: a.category,
      tier: a.tier,
      xp_reward: a.xp_reward,
      icon: a.icon,
      loot_box_tier: a.loot_box_tier,
      is_hidden: a.is_hidden,
      is_party: a.is_party,
      is_repeatable: a.is_repeatable,
      unlocked: isUnlocked,
      unlocked_at: unlock?.unlocked_at || null,
      unlock_count: unlock?.unlock_count || 0,
    };
  });

  const filtered = unlockedOnly ? merged.filter(a => a.unlocked) : merged;

  return NextResponse.json({
    achievements: filtered,
    total: merged.length,
    unlocked: merged.filter(a => a.unlocked).length,
  });
}
