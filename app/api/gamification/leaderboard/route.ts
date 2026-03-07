// GET /api/gamification/leaderboard — Household leaderboard

import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { getHouseholdContext, getHouseholdMemberIds } from "@/lib/household";

export const GET = withUser(async (request: NextRequest, { supabase, user }) => {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "alltime"; // alltime, weekly, monthly

  // Scope leaderboard to household members
  const ctx = await getHouseholdContext(supabase, user.id);
  const memberIds = ctx
    ? await getHouseholdMemberIds(supabase, ctx.household_id)
    : [user.id];

  if (period === "alltime") {
    // Get household crawler profiles
    const { data: profiles } = await supabase
      .schema("platform")
      .from("crawler_profiles")
      .select("user_id, crawler_name, total_xp, current_level, current_floor_id, login_streak, title")
      .in("user_id", memberIds)
      .order("total_xp", { ascending: false });

    // Get achievement counts for household members
    const { data: achievementCounts } = await supabase
      .schema("platform")
      .from("achievement_unlocks")
      .select("user_id")
      .in("user_id", memberIds);

    const countMap = new Map<string, number>();
    for (const a of achievementCounts || []) {
      countMap.set(a.user_id, (countMap.get(a.user_id) || 0) + 1);
    }

    const leaderboard = (profiles || []).map((p, idx) => ({
      rank: idx + 1,
      user_id: p.user_id,
      crawler_name: p.crawler_name,
      total_xp: p.total_xp,
      level: p.current_level,
      login_streak: p.login_streak,
      title: p.title,
      achievements_unlocked: countMap.get(p.user_id) || 0,
      is_current_user: p.user_id === user.id,
    }));

    return NextResponse.json({ leaderboard, period: "alltime" });
  }

  // Weekly or monthly — check snapshots
  const now = new Date();
  let periodStart: string;

  if (period === "weekly") {
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1);
    periodStart = monday.toISOString().split("T")[0];
  } else {
    periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }

  // Calculate from XP ledger for current period (household-scoped)
  const { data: periodXp } = await supabase
    .schema("platform")
    .from("xp_ledger")
    .select("user_id, amount")
    .in("user_id", memberIds)
    .gte("created_at", periodStart)
    .limit(10000);

  const xpTotals = new Map<string, number>();
  for (const entry of periodXp || []) {
    xpTotals.set(entry.user_id, (xpTotals.get(entry.user_id) || 0) + entry.amount);
  }

  // Get crawler names (household-scoped)
  const { data: profiles } = await supabase
    .schema("platform")
    .from("crawler_profiles")
    .select("user_id, crawler_name, current_level, title")
    .in("user_id", memberIds);

  const nameMap = new Map<string, { name: string; level: number; title: string | null }>();
  for (const p of profiles || []) {
    nameMap.set(p.user_id, { name: p.crawler_name, level: p.current_level, title: p.title });
  }

  const leaderboard = Array.from(xpTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map((entry, idx) => ({
      rank: idx + 1,
      user_id: entry[0],
      crawler_name: nameMap.get(entry[0])?.name || "Unknown",
      xp_earned: entry[1],
      level: nameMap.get(entry[0])?.level || 1,
      title: nameMap.get(entry[0])?.title || null,
      is_current_user: entry[0] === user.id,
    }));

  return NextResponse.json({ leaderboard, period, period_start: periodStart });
});
