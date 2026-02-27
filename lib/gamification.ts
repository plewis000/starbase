// Gamification Engine — XP, Levels, Achievements, Loot Boxes
// Core logic for the Desperado Club progression system

import { SupabaseClient } from "@supabase/supabase-js";
import { triggerNotification } from "@/lib/notify";

// =============================================================
// LEVEL CALCULATION
// =============================================================

// XP required for each level (exponential scaling)
// Level 1: 0 XP, Level 2: 100 XP, Level 3: 250 XP, etc.
const LEVEL_THRESHOLDS: number[] = [
  0,      // Level 1
  100,    // Level 2
  250,    // Level 3
  500,    // Level 4
  800,    // Level 5
  1200,   // Level 6
  1700,   // Level 7
  2300,   // Level 8
  3000,   // Level 9
  3800,   // Level 10
  4800,   // Level 11 (Floor 2)
  5900,   // Level 12
  7200,   // Level 13
  8700,   // Level 14
  10400,  // Level 15
  12300,  // Level 16
  14500,  // Level 17
  17000,  // Level 18
  19800,  // Level 19
  23000,  // Level 20
  26500,  // Level 21 (Floor 3)
  30500,  // Level 22
  35000,  // Level 23
  40000,  // Level 24
  45500,  // Level 25
  51500,  // Level 26
  58500,  // Level 27
  66000,  // Level 28
  74500,  // Level 29
  84000,  // Level 30
  94500,  // Level 31 (Floor 4)
];

// For levels beyond the table, extrapolate
function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  if (level <= LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[level - 1];
  // Extrapolate: each level beyond table costs ~12% more than previous
  const lastKnown = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const extraLevels = level - LEVEL_THRESHOLDS.length;
  return Math.floor(lastKnown * Math.pow(1.12, extraLevels));
}

export function calculateLevel(totalXp: number): { level: number; xpToNext: number; xpInLevel: number; progress: number } {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) {
    level++;
  }
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const xpInLevel = totalXp - currentLevelXp;
  const xpToNext = nextLevelXp - totalXp;
  const progress = (xpInLevel / (nextLevelXp - currentLevelXp)) * 100;

  return { level, xpToNext, xpInLevel, progress };
}

export function getFloorForLevel(level: number): number {
  return Math.floor((level - 1) / 10) + 1;
}

// =============================================================
// XP AWARD ENGINE
// =============================================================

interface XpAwardResult {
  xpAwarded: number;
  newTotal: number;
  leveledUp: boolean;
  oldLevel: number;
  newLevel: number;
  newFloor: boolean;
  oldFloor: number;
  newFloorNum: number;
}

export async function awardXp(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  actionType: string,
  description: string,
  sourceEntityType?: string,
  sourceEntityId?: string,
  multiplier: number = 1.0,
): Promise<XpAwardResult> {
  const effectiveAmount = Math.round(amount * multiplier);

  // Get current profile
  const { data: profile } = await supabase
    .schema("platform")
    .from("crawler_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!profile) {
    // Auto-create profile if missing
    await ensureProfile(supabase, userId);
    return awardXp(supabase, userId, amount, actionType, description, sourceEntityType, sourceEntityId, multiplier);
  }

  const oldTotal = profile.total_xp;
  const newTotal = Math.max(0, oldTotal + effectiveAmount); // Floor at 0
  const oldCalc = calculateLevel(oldTotal);
  const newCalc = calculateLevel(newTotal);
  const oldFloor = getFloorForLevel(oldCalc.level);
  const newFloorNum = getFloorForLevel(newCalc.level);

  // Record XP transaction
  await supabase
    .schema("platform")
    .from("xp_ledger")
    .insert({
      user_id: userId,
      amount: effectiveAmount,
      action_type: actionType,
      source_entity_type: sourceEntityType || null,
      source_entity_id: sourceEntityId || null,
      description,
      multiplier,
    });

  // Get floor record if changed
  let floorId = profile.current_floor_id;
  if (newFloorNum !== oldFloor) {
    const { data: floor } = await supabase
      .schema("config")
      .from("floors")
      .select("id")
      .eq("floor_number", newFloorNum)
      .single();
    if (floor) floorId = floor.id;
  }

  // Update profile
  await supabase
    .schema("platform")
    .from("crawler_profiles")
    .update({
      total_xp: newTotal,
      current_level: newCalc.level,
      xp_to_next_level: newCalc.xpToNext,
      current_floor_id: floorId,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  // Trigger level-up notification
  if (newCalc.level > oldCalc.level) {
    triggerNotification(supabase, {
      recipientUserId: userId,
      title: `Level Up! You reached Level ${newCalc.level}`,
      body: newFloorNum > oldFloor
        ? `Welcome to Floor ${newFloorNum}. The System acknowledges your continued existence.`
        : `${newTotal.toLocaleString()} XP total. Keep crawling.`,
      event: "level_up",
      metadata: { level: newCalc.level, floor: newFloorNum, total_xp: newTotal },
    }).catch(() => {});
  }

  return {
    xpAwarded: effectiveAmount,
    newTotal,
    leveledUp: newCalc.level > oldCalc.level,
    oldLevel: oldCalc.level,
    newLevel: newCalc.level,
    newFloor: newFloorNum > oldFloor,
    oldFloor,
    newFloorNum,
  };
}

// =============================================================
// ACHIEVEMENT EVALUATION ENGINE
// =============================================================

interface AchievementCheck {
  achievementId: string;
  achievementSlug: string;
  achievementName: string;
  description: string;
  xpReward: number;
  lootBoxTier: string | null;
  isParty: boolean;
}

export async function checkAchievements(
  supabase: SupabaseClient,
  userId: string,
  triggerType: string,
  context: Record<string, unknown> = {},
): Promise<AchievementCheck[]> {
  // Get all active achievements matching this trigger type
  const { data: achievements } = await supabase
    .schema("config")
    .from("achievements")
    .select("*")
    .eq("trigger_type", triggerType)
    .eq("active", true);

  if (!achievements || achievements.length === 0) return [];

  // Get user's existing unlocks
  const { data: unlocks } = await supabase
    .schema("platform")
    .from("achievement_unlocks")
    .select("achievement_id, unlock_count")
    .eq("user_id", userId);

  const unlockMap = new Map<string, number>();
  for (const u of unlocks || []) {
    unlockMap.set(u.achievement_id, u.unlock_count);
  }

  const newUnlocks: AchievementCheck[] = [];

  for (const achievement of achievements) {
    const existingCount = unlockMap.get(achievement.id) || 0;

    // Skip non-repeatable achievements that are already unlocked
    if (!achievement.is_repeatable && existingCount > 0) continue;

    // Evaluate trigger condition
    const met = await evaluateTrigger(supabase, userId, achievement, context);
    if (!met) continue;

    // Unlock the achievement
    const newCount = existingCount + 1;
    await supabase
      .schema("platform")
      .from("achievement_unlocks")
      .insert({
        user_id: userId,
        achievement_id: achievement.id,
        xp_awarded: achievement.xp_reward,
        unlock_count: newCount,
        metadata: context,
      });

    // Award XP
    await awardXp(
      supabase,
      userId,
      achievement.xp_reward,
      "achievement",
      `Achievement: ${achievement.name}`,
      "achievement",
      achievement.id,
    );

    // Generate loot box if applicable
    if (achievement.loot_box_tier) {
      const { data: tier } = await supabase
        .schema("config")
        .from("loot_box_tiers")
        .select("id")
        .eq("slug", achievement.loot_box_tier)
        .single();

      if (tier) {
        await supabase
          .schema("platform")
          .from("loot_boxes")
          .insert({
            user_id: userId,
            tier_id: tier.id,
            source_achievement_id: achievement.id,
            source_description: `Unlocked: ${achievement.name}`,
          });
      }
    }

    // Trigger achievement notification
    triggerNotification(supabase, {
      recipientUserId: userId,
      title: `Achievement Unlocked: ${achievement.name}`,
      body: `${achievement.description} (+${achievement.xp_reward} XP${achievement.loot_box_tier ? ` + ${achievement.loot_box_tier} loot box` : ""})`,
      event: "achievement_unlocked",
      metadata: {
        achievement_id: achievement.id,
        achievement_slug: achievement.slug,
        xp_reward: achievement.xp_reward,
        loot_box_tier: achievement.loot_box_tier,
      },
    }).catch(() => {});

    newUnlocks.push({
      achievementId: achievement.id,
      achievementSlug: achievement.slug,
      achievementName: achievement.name,
      description: achievement.description,
      xpReward: achievement.xp_reward,
      lootBoxTier: achievement.loot_box_tier,
      isParty: achievement.is_party,
    });
  }

  return newUnlocks;
}

// Evaluate a specific trigger condition
async function evaluateTrigger(
  supabase: SupabaseClient,
  userId: string,
  achievement: { trigger_type: string; trigger_config: Record<string, unknown> },
  context: Record<string, unknown>,
): Promise<boolean> {
  const config = achievement.trigger_config;
  const threshold = (config.threshold as number) || 0;

  switch (achievement.trigger_type) {
    case "task_count": {
      const { count } = await supabase
        .schema("platform")
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("created_by", userId)
        .not("completed_at", "is", null);
      return (count || 0) >= threshold;
    }

    case "habit_streak": {
      const currentStreak = (context.current_streak as number) || 0;
      return currentStreak >= threshold;
    }

    case "habit_count": {
      const { count } = await supabase
        .schema("platform")
        .from("habit_check_ins")
        .select("*", { count: "exact", head: true })
        .eq("checked_by", userId);
      return (count || 0) >= threshold;
    }

    case "goal_completed": {
      const { count } = await supabase
        .schema("platform")
        .from("goals")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", userId)
        .eq("status", "completed");
      return (count || 0) >= threshold;
    }

    case "login_streak": {
      const { data: profile } = await supabase
        .schema("platform")
        .from("crawler_profiles")
        .select("login_streak")
        .eq("user_id", userId)
        .single();
      return (profile?.login_streak || 0) >= threshold;
    }

    case "level_reached": {
      const { data: profile } = await supabase
        .schema("platform")
        .from("crawler_profiles")
        .select("current_level")
        .eq("user_id", userId)
        .single();
      return (profile?.current_level || 0) >= threshold;
    }

    case "speed_complete": {
      // Context should include task creation time and completion time
      const maxMinutes = (config.max_minutes as number) || 60;
      const createdAt = context.created_at as string;
      const completedAt = context.completed_at as string;
      if (!createdAt || !completedAt) return false;
      const diffMs = new Date(completedAt).getTime() - new Date(createdAt).getTime();
      return diffMs <= maxMinutes * 60 * 1000;
    }

    case "zero_overdue": {
      // Check if the user has had zero overdue tasks for N consecutive days
      // This is complex — for now, check context flag
      return (context.consecutive_zero_overdue_days as number || 0) >= threshold;
    }

    case "shopping_count": {
      const { count } = await supabase
        .schema("household")
        .from("shopping_lists")
        .select("*", { count: "exact", head: true })
        .eq("created_by", userId)
        .not("completed_at", "is", null);
      return (count || 0) >= threshold;
    }

    case "budget_under": {
      // Context should provide consecutive months under budget
      return (context.consecutive_under_budget_months as number || 0) >= threshold;
    }

    case "combo_streak": {
      // All habits maintained for N days
      return (context.all_habits_streak as number || 0) >= threshold;
    }

    case "party_task_streak": {
      // Both crawlers cleared all shared tasks for N days
      return (context.party_task_streak as number || 0) >= threshold;
    }

    case "party_habit_sync": {
      // Both crawlers maintained same habit for N days
      return (context.sync_streak as number || 0) >= threshold;
    }

    case "custom": {
      // Custom achievements are checked by type in context
      const customType = config.type as string;
      return context.custom_type === customType;
    }

    default:
      return false;
  }
}

// =============================================================
// LOOT BOX ENGINE
// =============================================================

export interface LootBoxOpenResult {
  lootBoxId: string;
  tierName: string;
  rewardName: string;
  rewardDescription?: string;
  rewardIcon?: string;
}

export async function openLootBox(
  supabase: SupabaseClient,
  userId: string,
  lootBoxId: string,
): Promise<LootBoxOpenResult | null> {
  // Get the loot box
  const { data: box } = await supabase
    .schema("platform")
    .from("loot_boxes")
    .select("*, tier:tier_id(slug, name)")
    .eq("id", lootBoxId)
    .eq("user_id", userId)
    .eq("opened", false)
    .single();

  if (!box) return null;

  // Get available rewards for this tier
  const { data: rewards } = await supabase
    .schema("platform")
    .from("loot_box_rewards")
    .select("*")
    .eq("user_id", userId)
    .eq("tier_id", box.tier_id)
    .eq("active", true);

  if (!rewards || rewards.length === 0) {
    // No rewards configured — check household rewards
    const { data: householdRewards } = await supabase
      .schema("platform")
      .from("loot_box_rewards")
      .select("*")
      .eq("tier_id", box.tier_id)
      .eq("is_household", true)
      .eq("active", true);

    if (!householdRewards || householdRewards.length === 0) return null;

    // Pick random household reward
    const reward = householdRewards[Math.floor(Math.random() * householdRewards.length)];
    return finishOpen(supabase, box, reward);
  }

  // Pick random reward
  const reward = rewards[Math.floor(Math.random() * rewards.length)];
  return finishOpen(supabase, box, reward);
}

async function finishOpen(
  supabase: SupabaseClient,
  box: Record<string, unknown>,
  reward: Record<string, unknown>,
): Promise<LootBoxOpenResult> {
  // Update box as opened
  await supabase
    .schema("platform")
    .from("loot_boxes")
    .update({
      opened: true,
      opened_at: new Date().toISOString(),
      reward_id: reward.id,
    })
    .eq("id", box.id);

  // Increment reward win count
  await supabase
    .schema("platform")
    .from("loot_box_rewards")
    .update({ times_won: (reward.times_won as number || 0) + 1 })
    .eq("id", reward.id);

  const tier = box.tier as Record<string, string> | undefined;

  return {
    lootBoxId: box.id as string,
    tierName: tier?.name || "Box",
    rewardName: reward.name as string,
    rewardDescription: reward.description as string | undefined,
    rewardIcon: reward.icon as string | undefined,
  };
}

// =============================================================
// PROFILE MANAGEMENT
// =============================================================

export async function ensureProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .schema("platform")
    .from("crawler_profiles")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (existing) return;

  // Get first floor
  const { data: floor1 } = await supabase
    .schema("config")
    .from("floors")
    .select("id")
    .eq("floor_number", 1)
    .single();

  // Get user name for crawler_name default
  const { data: user } = await supabase
    .schema("platform")
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .single();

  await supabase
    .schema("platform")
    .from("crawler_profiles")
    .insert({
      user_id: userId,
      crawler_name: user?.full_name || "Unknown Crawler",
      current_floor_id: floor1?.id || null,
      total_xp: 0,
      current_level: 1,
      xp_to_next_level: 100,
    });
}

export async function updateLoginStreak(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ streak: number; isNew: boolean }> {
  const today = new Date().toISOString().split("T")[0];

  const { data: profile } = await supabase
    .schema("platform")
    .from("crawler_profiles")
    .select("login_streak, longest_login_streak, last_login_date")
    .eq("user_id", userId)
    .single();

  if (!profile) {
    await ensureProfile(supabase, userId);
    return { streak: 1, isNew: true };
  }

  if (profile.last_login_date === today) {
    return { streak: profile.login_streak, isNew: false };
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const isConsecutive = profile.last_login_date === yesterdayStr;
  const newStreak = isConsecutive ? profile.login_streak + 1 : 1;
  const longestStreak = Math.max(profile.longest_login_streak, newStreak);

  await supabase
    .schema("platform")
    .from("crawler_profiles")
    .update({
      login_streak: newStreak,
      longest_login_streak: longestStreak,
      last_login_date: today,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { streak: newStreak, isNew: true };
}
