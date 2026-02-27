// GET /api/gamification/leaderboard — Household leaderboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "alltime"; // alltime, weekly, monthly

  if (period === "alltime") {
    // Get all crawler profiles
    const { data: profiles } = await supabase
      .schema("platform")
      .from("crawler_profiles")
      .select("user_id, crawler_name, total_xp, current_level, current_floor_id, login_streak, title")
      .order("total_xp", { ascending: false });

    // Get achievement counts per user
    const { data: achievementCounts } = await supabase
      .schema("platform")
      .from("achievement_unlocks")
      .select("user_id");

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

  // Calculate from XP ledger for current period
  const { data: periodXp } = await supabase
    .schema("platform")
    .from("xp_ledger")
    .select("user_id, amount")
    .gte("created_at", periodStart);

  const xpTotals = new Map<string, number>();
  for (const entry of periodXp || []) {
    xpTotals.set(entry.user_id, (xpTotals.get(entry.user_id) || 0) + entry.amount);
  }

  // Get crawler names
  const { data: profiles } = await supabase
    .schema("platform")
    .from("crawler_profiles")
    .select("user_id, crawler_name, current_level, title");

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
}
