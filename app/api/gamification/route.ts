// GET /api/gamification — Crawler profile + stats
// POST /api/gamification — Update profile (crawler_name, showcase_achievements)

import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { ensureProfile, updateLoginStreak, calculateLevel, getFloorForLevel, checkActivationReadiness, activateGamification } from "@/lib/gamification";

export const GET = withUser(async (_request, { supabase, user }) => {
  // Ensure profile exists
  await ensureProfile(supabase, user.id);

  // Update login streak
  const { streak } = await updateLoginStreak(supabase, user.id);

  // Get profile
  const { data: profile } = await supabase
    .schema("platform")
    .from("crawler_profiles")
    .select("*, floor:current_floor_id(floor_number, name, icon, color)")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Refresh crawler stats + class only if stale (>6 hours) — throttled
  const staleThreshold = 6 * 60 * 60 * 1000; // 6 hours
  const lastUpdate = profile.stats_updated_at ? new Date(profile.stats_updated_at).getTime() : 0;
  if (Date.now() - lastUpdate > staleThreshold) {
    await Promise.allSettled([
      supabase.schema("platform").rpc("calculate_crawler_stats", { p_user_id: user.id }),
      supabase.schema("platform").rpc("calculate_crawler_class", { p_user_id: user.id }),
    ]);
    // Refetch updated stats
    const { data: refreshed } = await supabase
      .schema("platform")
      .from("crawler_profiles")
      .select("stat_str, stat_dex, stat_con, stat_int, stat_cha, crawler_class, class_description, stats_updated_at")
      .eq("user_id", user.id)
      .single();
    if (refreshed) {
      Object.assign(profile, refreshed);
    }
  }

  // Calculate level details
  const levelInfo = calculateLevel(profile.total_xp);

  // Get recent XP history (last 20 entries)
  const { data: recentXp } = await supabase
    .schema("platform")
    .from("xp_ledger")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Get achievement count
  const { count: achievementCount } = await supabase
    .schema("platform")
    .from("achievement_unlocks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Get unopened loot boxes count
  const { count: unopenedBoxes } = await supabase
    .schema("platform")
    .from("loot_boxes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("opened", false);

  // Get active buffs (current streaks)
  const { data: activeStreaks } = await supabase
    .schema("platform")
    .from("habits")
    .select("id, title, current_streak")
    .eq("owner_id", user.id)
    .eq("status", "active")
    .gt("current_streak", 0)
    .order("current_streak", { ascending: false });

  // Get active debuffs (overdue tasks)
  const { data: overdueTasks } = await supabase
    .schema("platform")
    .from("tasks")
    .select("id, title, due_date")
    .is("completed_at", null)
    .lt("due_date", new Date().toISOString().split("T")[0])
    .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`);

  // If not activated, include readiness info
  let activation = null;
  if (!profile.gamification_activated) {
    activation = await checkActivationReadiness(supabase, user.id);
  }

  return NextResponse.json({
    profile: {
      ...profile,
      level: levelInfo.level,
      xp_progress: levelInfo.progress,
      xp_in_level: levelInfo.xpInLevel,
      xp_to_next: levelInfo.xpToNext,
      floor_number: getFloorForLevel(levelInfo.level),
      login_streak: streak,
    },
    activated: profile.gamification_activated,
    activation,
    stats: {
      achievement_count: achievementCount || 0,
      unopened_boxes: unopenedBoxes || 0,
    },
    buffs: (activeStreaks || []).map(h => ({
      id: h.id,
      name: h.title,
      streak: h.current_streak,
    })),
    debuffs: (overdueTasks || []).map(t => ({
      id: t.id,
      name: t.title,
      due_date: t.due_date,
    })),
    recent_xp: recentXp || [],
  });
});

export const POST = withUser(async (request: NextRequest, { supabase, user }) => {
  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // Handle activation request
  if (body.action === "activate") {
    await ensureProfile(supabase, user.id);
    const success = await activateGamification(supabase, user.id);
    if (!success) {
      return NextResponse.json({ error: "Prerequisites not met. Set up rewards and use at least 2 modules first." }, { status: 400 });
    }
    return NextResponse.json({ activated: true });
  }

  const updates: Record<string, unknown> = {};

  if (body.crawler_name !== undefined) {
    updates.crawler_name = body.crawler_name.trim().slice(0, 50);
  }
  if (body.showcase_achievement_ids !== undefined) {
    updates.showcase_achievement_ids = (body.showcase_achievement_ids as string[]).slice(0, 5);
  }
  if (body.title !== undefined) {
    updates.title = body.title?.trim().slice(0, 50) || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid updates" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data: profile, error } = await supabase
    .schema("platform")
    .from("crawler_profiles")
    .update(updates)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ profile });
});
