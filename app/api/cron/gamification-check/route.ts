/**
 * Cron: Gamification Achievement Check — runs at 4 AM UTC (11 PM CT)
 * Evaluates trigger types that need daily context calculation:
 *   - zero_overdue: consecutive days with no overdue tasks
 *   - task_streak: consecutive days with all tasks cleared
 *   - combo_streak: consecutive days with all habits maintained
 *   - budget_under: consecutive months under budget
 *   - party_task_streak: both users cleared shared tasks for N days
 *   - party_habit_sync: both users maintained same habit for N days
 *   - custom (subset): achievements that fire on daily conditions
 *
 * Also checks level_reached and login_streak (cheap, no context needed).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform, config } from "@/lib/supabase/schemas";
import { checkAchievements } from "@/lib/gamification";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get all active users
  const { data: users, error: usersErr } = await platform(supabase)
    .from("users")
    .select("id");

  if (usersErr || !users) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  const results: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (const user of users) {
    try {
      const userResults = await evaluateUserAchievements(supabase, user.id);
      if (userResults.length > 0) {
        results.push({ userId: user.id, unlocked: userResults.map(u => u.achievementSlug) });
      }
    } catch (err) {
      errors.push(`${user.id}: ${err}`);
    }
  }

  return NextResponse.json({
    checked: users.length,
    unlocked: results,
    errors: errors.length > 0 ? errors : undefined,
  });
}

async function evaluateUserAchievements(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  const allUnlocks: Awaited<ReturnType<typeof checkAchievements>> = [];

  // --- zero_overdue: count consecutive days with 0 overdue tasks ---
  const zeroOverdueDays = await countConsecutiveZeroOverdueDays(supabase, userId);
  if (zeroOverdueDays > 0) {
    const unlocks = await checkAchievements(supabase, userId, "zero_overdue", {
      consecutive_zero_overdue_days: zeroOverdueDays,
    });
    allUnlocks.push(...unlocks);
  }

  // --- task_streak: consecutive days with all assigned tasks completed ---
  const allClearDays = await countConsecutiveAllClearDays(supabase, userId);
  if (allClearDays > 0) {
    const unlocks = await checkAchievements(supabase, userId, "task_streak", {
      consecutive_all_clear_days: allClearDays,
    });
    allUnlocks.push(...unlocks);
  }

  // --- combo_streak: consecutive days where all active habits were checked in ---
  const allHabitsStreak = await countAllHabitsStreak(supabase, userId);
  if (allHabitsStreak > 0) {
    const unlocks = await checkAchievements(supabase, userId, "combo_streak", {
      all_habits_streak: allHabitsStreak,
    });
    allUnlocks.push(...unlocks);
  }

  // --- budget_under: consecutive months where all budgets were under ---
  const underBudgetMonths = await countConsecutiveUnderBudgetMonths(supabase, userId);
  if (underBudgetMonths > 0) {
    const unlocks = await checkAchievements(supabase, userId, "budget_under", {
      consecutive_under_budget_months: underBudgetMonths,
    });
    allUnlocks.push(...unlocks);
  }

  // --- party_task_streak: both household members cleared shared tasks ---
  const partyTaskStreak = await countPartyTaskStreak(supabase, userId);
  if (partyTaskStreak > 0) {
    const unlocks = await checkAchievements(supabase, userId, "party_task_streak", {
      party_task_streak: partyTaskStreak,
    });
    allUnlocks.push(...unlocks);
  }

  // --- party_habit_sync: both members maintained same habit ---
  const syncStreak = await countPartyHabitSync(supabase, userId);
  if (syncStreak > 0) {
    const unlocks = await checkAchievements(supabase, userId, "party_habit_sync", {
      sync_streak: syncStreak,
    });
    allUnlocks.push(...unlocks);
  }

  // --- task_count: catches retroactive completions (First Blood, Ten Down, Centurion) ---
  const taskCountUnlocks = await checkAchievements(supabase, userId, "task_count", {});
  allUnlocks.push(...taskCountUnlocks);

  // --- level_reached: simple check, no context needed ---
  const levelUnlocks = await checkAchievements(supabase, userId, "level_reached", {});
  allUnlocks.push(...levelUnlocks);

  // --- login_streak: simple check, no context needed ---
  const loginUnlocks = await checkAchievements(supabase, userId, "login_streak", {});
  allUnlocks.push(...loginUnlocks);

  // --- custom: perfect_day (all tasks done + all habits checked in) ---
  const allClear = allClearDays > 0;
  const allHabitsDone = allHabitsStreak > 0;
  if (allClear && allHabitsDone) {
    const unlocks = await checkAchievements(supabase, userId, "custom", {
      custom_type: "perfect_day",
    });
    allUnlocks.push(...unlocks);
  }

  // --- custom: achievement_count (10+ achievements unlocked) ---
  const { count: achievementCount } = await platform(supabase)
    .from("achievement_unlocks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((achievementCount || 0) >= 10) {
    const unlocks = await checkAchievements(supabase, userId, "custom", {
      custom_type: "achievement_count",
    });
    allUnlocks.push(...unlocks);
  }

  // --- custom: household_centurion (100+ total household task completions) ---
  const householdMembers = await getHouseholdMembers(supabase, userId);
  const { count: householdTaskCount } = await platform(supabase)
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .in("completed_by", householdMembers)
    .not("completed_at", "is", null);
  if ((householdTaskCount || 0) >= 100) {
    const unlocks = await checkAchievements(supabase, userId, "custom", {
      custom_type: "party_task_total",
    });
    allUnlocks.push(...unlocks);
  }

  return allUnlocks;
}

// =============================================================
// CONTEXT CALCULATORS
// =============================================================

/**
 * Count consecutive days (going back from yesterday) where the user
 * had zero overdue tasks at end of day.
 */
async function countConsecutiveZeroOverdueDays(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<number> {
  // Use daily_aggregates if available, otherwise compute from tasks
  const { data: aggregates } = await platform(supabase)
    .from("daily_aggregates")
    .select("aggregate_date, metrics")
    .eq("user_id", userId)
    .order("aggregate_date", { ascending: false })
    .limit(60);

  if (aggregates && aggregates.length > 0) {
    let streak = 0;
    for (const agg of aggregates) {
      const metrics = agg.metrics as Record<string, number> | null;
      const overdue = metrics?.overdue_tasks ?? metrics?.tasks_overdue ?? -1;
      if (overdue === 0) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  // Fallback: check current overdue count (if 0, return 1)
  const today = new Date().toISOString().split("T")[0];
  const { count } = await platform(supabase)
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .or(`assigned_to.eq.${userId},owner_ids.cs.{${userId}}`)
    .is("completed_at", null)
    .lt("due_date", today);

  return (count || 0) === 0 ? 1 : 0;
}

/**
 * Count consecutive days where all assigned tasks were completed.
 * Uses daily_aggregates metrics.
 */
async function countConsecutiveAllClearDays(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<number> {
  const { data: aggregates } = await platform(supabase)
    .from("daily_aggregates")
    .select("aggregate_date, metrics")
    .eq("user_id", userId)
    .order("aggregate_date", { ascending: false })
    .limit(30);

  if (!aggregates || aggregates.length === 0) return 0;

  let streak = 0;
  for (const agg of aggregates) {
    const metrics = agg.metrics as Record<string, number> | null;
    const pending = metrics?.tasks_pending ?? metrics?.pending_tasks ?? -1;
    const overdue = metrics?.overdue_tasks ?? metrics?.tasks_overdue ?? -1;
    // "All clear" = 0 pending AND 0 overdue
    if (pending === 0 && overdue === 0) {
      streak++;
    } else if (pending === -1 && overdue === -1) {
      // No data for this day, break streak
      break;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Count consecutive days where ALL active habits had a check-in.
 */
async function countAllHabitsStreak(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<number> {
  // Get all active habit-tasks for this user
  const { data: activeHabits } = await platform(supabase)
    .from("tasks")
    .select("id")
    .eq("is_habit", true)
    .contains("owner_ids", [userId])
    .is("completed_at", null);

  if (!activeHabits || activeHabits.length === 0) return 0;

  const habitIds = activeHabits.map(h => h.id);

  // Get completions for the last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90);
  const cutoffStr = ninetyDaysAgo.toISOString().split("T")[0];

  const { data: checkIns } = await platform(supabase)
    .from("task_completions")
    .select("task_id, completed_date")
    .in("task_id", habitIds)
    .gte("completed_date", cutoffStr)
    .order("completed_date", { ascending: false });

  if (!checkIns) return 0;

  // Group by date
  const byDate = new Map<string, Set<string>>();
  for (const ci of checkIns) {
    if (!byDate.has(ci.completed_date)) byDate.set(ci.completed_date, new Set());
    byDate.get(ci.completed_date)!.add(ci.task_id);
  }

  // Count consecutive days from yesterday where all habits checked in
  let streak = 0;
  const d = new Date();
  d.setDate(d.getDate() - 1); // Start from yesterday

  while (streak < 90) {
    const dateStr = d.toISOString().split("T")[0];
    const checkedIn = byDate.get(dateStr);
    if (!checkedIn || checkedIn.size < habitIds.length) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }

  return streak;
}

/**
 * Count consecutive months where all budgets were under limit.
 */
async function countConsecutiveUnderBudgetMonths(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<number> {
  // Get active budgets
  const { data: budgets } = await supabase
    .schema("finance")
    .from("budgets")
    .select("id, amount, category_id")
    .eq("user_id", userId)
    .is("effective_until", null);

  if (!budgets || budgets.length === 0) return 0;

  const now = new Date();
  const categoryIds = budgets.map(b => b.category_id);

  // Compute the full date range: 12 months back to start of current month
  const earliestDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));
  const rangeStart = earliestDate.toISOString().split("T")[0];
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rangeEnd = currentMonthStart.toISOString().split("T")[0];

  // ONE query: fetch all transactions for this user across all budget categories for the full range
  const { data: allTransactions } = await supabase
    .schema("finance")
    .from("transactions")
    .select("amount, category_id, date")
    .eq("user_id", userId)
    .in("category_id", categoryIds)
    .gte("date", rangeStart)
    .lt("date", rangeEnd);

  // Group transactions by month+category
  const spendingByMonthCategory = new Map<string, number>();
  for (const t of allTransactions || []) {
    const monthKey = (t.date as string).slice(0, 7); // "YYYY-MM"
    const key = `${monthKey}:${t.category_id}`;
    spendingByMonthCategory.set(key, (spendingByMonthCategory.get(key) || 0) + Math.abs(Number(t.amount)));
  }

  // Check consecutive months
  let streak = 0;
  for (let monthsBack = 1; monthsBack <= 12; monthsBack++) {
    const checkDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
    const monthKey = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, "0")}`;

    let allUnder = true;
    for (const budget of budgets) {
      const total = spendingByMonthCategory.get(`${monthKey}:${budget.category_id}`) || 0;
      if (total > Number(budget.amount)) {
        allUnder = false;
        break;
      }
    }

    if (allUnder) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Count consecutive days where both household members completed
 * all their assigned tasks.
 */
async function countPartyTaskStreak(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<number> {
  // Get household members
  const members = await getHouseholdMembers(supabase, userId);
  if (members.length < 2) return 0;

  // Get daily_aggregates for all members, last 30 days
  const { data: aggregates } = await platform(supabase)
    .from("daily_aggregates")
    .select("user_id, aggregate_date, metrics")
    .in("user_id", members)
    .order("aggregate_date", { ascending: false })
    .limit(60 * members.length);

  if (!aggregates) return 0;

  // Group by date
  const byDate = new Map<string, Map<string, Record<string, number>>>();
  for (const agg of aggregates) {
    if (!byDate.has(agg.aggregate_date)) byDate.set(agg.aggregate_date, new Map());
    byDate.get(agg.aggregate_date)!.set(agg.user_id, agg.metrics as Record<string, number>);
  }

  let streak = 0;
  const d = new Date();
  d.setDate(d.getDate() - 1);

  while (streak < 30) {
    const dateStr = d.toISOString().split("T")[0];
    const dayData = byDate.get(dateStr);
    if (!dayData || dayData.size < members.length) break;

    let allClear = true;
    for (const [, metrics] of dayData) {
      const pending = metrics?.tasks_pending ?? metrics?.pending_tasks ?? -1;
      const overdue = metrics?.overdue_tasks ?? metrics?.tasks_overdue ?? -1;
      if (pending !== 0 || overdue !== 0) {
        allClear = false;
        break;
      }
    }

    if (!allClear) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }

  return streak;
}

/**
 * Count consecutive days where both household members maintained
 * at least one shared habit (checked in to the same habit).
 */
async function countPartyHabitSync(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<number> {
  const members = await getHouseholdMembers(supabase, userId);
  if (members.length < 2) return 0;

  // Find habit-tasks owned by any household member
  const { data: habits } = await platform(supabase)
    .from("tasks")
    .select("id, owner_ids, title")
    .eq("is_habit", true)
    .is("completed_at", null);

  // Filter to habits owned by household members
  const memberSet = new Set(members);
  const memberHabits = (habits || []).filter(h =>
    Array.isArray(h.owner_ids) && h.owner_ids.some((oid: string) => memberSet.has(oid))
  );

  if (memberHabits.length === 0) return 0;

  // Group by title to find shared habits
  const byTitle = new Map<string, string[]>();
  for (const h of memberHabits) {
    const key = (h.title as string).toLowerCase().trim();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key)!.push(h.id);
  }

  // Find titles that appear for multiple owners
  const sharedHabitIds: string[] = [];
  for (const [, ids] of byTitle) {
    const owners = new Set(memberHabits.filter(h => ids.includes(h.id)).flatMap(h => h.owner_ids || []));
    const memberOwners = [...owners].filter(o => memberSet.has(o as string));
    if (memberOwners.length >= 2) {
      sharedHabitIds.push(...ids);
    }
  }

  if (sharedHabitIds.length === 0) return 0;

  // Get completions for shared habits, last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const cutoffStr = thirtyDaysAgo.toISOString().split("T")[0];

  const { data: checkIns } = await platform(supabase)
    .from("task_completions")
    .select("task_id, completed_date, completed_by")
    .in("task_id", sharedHabitIds)
    .gte("completed_date", cutoffStr);

  if (!checkIns) return 0;

  // For each day, check if both members checked in to at least one shared habit pair
  let streak = 0;
  const d = new Date();
  d.setDate(d.getDate() - 1);

  while (streak < 30) {
    const dateStr = d.toISOString().split("T")[0];
    const dayChecks = checkIns.filter(ci => ci.completed_date === dateStr);
    const checkedByMember = new Set(dayChecks.map(ci => ci.completed_by));

    // Both members must have checked in
    const membersCovered = members.filter(m => checkedByMember.has(m));
    if (membersCovered.length < 2) break;

    streak++;
    d.setDate(d.getDate() - 1);
  }

  return streak;
}

// =============================================================
// HELPERS
// =============================================================

async function getHouseholdMembers(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<string[]> {
  // Get user's household
  const { data: membership } = await supabase
    .schema("platform")
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .single();

  if (!membership) return [userId];

  const { data: members } = await supabase
    .schema("platform")
    .from("household_members")
    .select("user_id")
    .eq("household_id", membership.household_id);

  return (members || []).map(m => m.user_id);
}
