// POST /api/gamification/reset — Admin-only: reset all gamification data for household

import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api/withAuth";
import { getHouseholdMemberIds } from "@/lib/household";
import { platform } from "@/lib/supabase/schemas";

export const POST = withAdmin(async (_request, { supabase, ctx }) => {
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  if (memberIds.length === 0) {
    return NextResponse.json({ error: "No household members found" }, { status: 404 });
  }

  const p = platform(supabase);

  // Delete loot boxes for household members
  const { error: lootErr } = await p
    .from("loot_boxes")
    .delete()
    .in("user_id", memberIds);

  if (lootErr) {
    console.error("Reset: loot_boxes delete failed", lootErr.message);
    return NextResponse.json({ error: "Failed to reset loot boxes" }, { status: 500 });
  }

  // Delete achievement unlocks for household members
  const { error: achieveErr } = await p
    .from("achievement_unlocks")
    .delete()
    .in("user_id", memberIds);

  if (achieveErr) {
    console.error("Reset: achievement_unlocks delete failed", achieveErr.message);
    return NextResponse.json({ error: "Failed to reset achievements" }, { status: 500 });
  }

  // Delete XP ledger entries for household members
  const { error: xpErr } = await p
    .from("xp_ledger")
    .delete()
    .in("user_id", memberIds);

  if (xpErr) {
    console.error("Reset: xp_ledger delete failed", xpErr.message);
    return NextResponse.json({ error: "Failed to reset XP ledger" }, { status: 500 });
  }

  // Reset crawler profiles for household members
  const { error: profileErr } = await p
    .from("crawler_profiles")
    .update({
      total_xp: 0,
      current_level: 1,
      xp_to_next_level: 100,
      login_streak: 0,
      longest_login_streak: 0,
      last_login_date: null,
      showcase_achievement_ids: "{}",
      gamification_activated: false,
      activated_at: null,
      stat_str: 0,
      stat_dex: 0,
      stat_con: 0,
      stat_int: 0,
      stat_cha: 0,
      crawler_class: null,
      class_description: null,
      stats_updated_at: null,
    })
    .in("user_id", memberIds);

  if (profileErr) {
    console.error("Reset: crawler_profiles update failed", profileErr.message);
    return NextResponse.json({ error: "Failed to reset profiles" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: "Gamification reset complete",
    users_reset: memberIds.length,
  });
});
