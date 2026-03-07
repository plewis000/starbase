/**
 * AI-powered briefing engine.
 * Generates personalized daily briefings and weekly reviews using Zev's voice.
 * Household-aware: includes cross-member data for coordination.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { platform, config } from "@/lib/supabase/schemas";
import { anthropic, getModel } from "@/lib/agent/client";

interface BriefingData {
  userName: string;
  partnerName: string | null;
  // User's own data
  overdueTaskCount: number;
  overdueTasks: { title: string; due_date: string }[];
  todayTaskCount: number;
  todayTasks: { title: string }[];
  tomorrowTaskCount: number;
  habitsDue: number;
  habitsChecked: number;
  habitStreaks: { title: string; streak: number }[];
  activeGoals: { title: string; progress: number }[];
  pendingSuggestions: { title: string; category: string }[];
  crawlerLevel: number | null;
  xpToday: number;
  // Partner's data (for household context)
  partnerOverdue: number;
  partnerTodayTasks: number;
  partnerHabitsUnchecked: number;
  // Recent wins
  recentCompletions: string[];
  // Behavioral trends (week-over-week comparison)
  trends: TrendData | null;
}

interface TrendData {
  habitRateThis: number; // % this week
  habitRateLast: number; // % last week
  tasksCompletedThis: number;
  tasksCompletedLast: number;
  xpThis: number;
  xpLast: number;
  alert: string | null; // human-readable trend alert
}

interface WeeklyData {
  userName: string;
  partnerName: string | null;
  // User metrics
  tasksCompleted: number;
  tasksCreated: number;
  habitsCompletionRate: number;
  xpEarned: number;
  currentLevel: number | null;
  streaksActive: number;
  streaksBroken: number;
  goalsProgress: { title: string; delta: number; current: number }[];
  topAchievements: string[];
  // Partner metrics
  partnerTasksCompleted: number;
  partnerHabitRate: number;
  // Household combined
  householdTasksCompleted: number;
  // Patterns & suggestions
  newPatterns: string[];
  pendingSuggestions: { title: string; category: string }[];
}

const BRIEFING_PROMPT = `You are Zev, writing a personalized morning briefing for a household member. You're warm, professional, with genuine care. Not snarky — you're invested in their success.

Write a SHORT morning briefing (150-250 words max). Include:
1. A personal greeting (use their name, vary the opener)
2. Priority items (overdue first, then today's tasks)
3. Habit check-in status (what's done, what's remaining)
4. One household coordination note if relevant (partner's status, shared items)
5. One motivational or strategic note (celebrate wins, flag risks, suggest focus)

Rules:
- Be concise. Bullet points for lists.
- If they have overdue tasks, address it directly but constructively.
- If partner has items that might need coordination, mention it naturally.
- Reference crawler stats naturally if interesting (level up close, streak at risk).
- Don't list every single task — summarize and highlight top 2-3.
- End with a clear "focus for today" recommendation.
- NO forced enthusiasm. NO "Great morning!". Be real.`;

const WEEKLY_PROMPT = `You are Zev, writing a personalized weekly review for a household member. Warm, honest, coaching-oriented.

Write a weekly review (200-350 words max). Include:
1. Week summary headline (one sentence capturing the week's story)
2. Key wins — tasks completed, streaks maintained, goals progressed
3. Misses — what didn't get done, streaks broken, areas that need attention
4. Household pulse — how the unit performed together
5. Pattern insights — any behavioral observations worth noting
6. Next week focus — 1-2 specific recommendations

Rules:
- Be honest about bad weeks. "Rough week" is fine. Don't sugarcoat.
- Celebrate genuinely when things went well. Let the enthusiasm slip through.
- Use specific numbers but don't drown in them.
- If patterns suggest a recurring problem, call it out constructively.
- End with ONE clear priority for next week.`;

/**
 * Generate an AI-powered daily briefing for a user.
 */
export async function generateDailyBriefing(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ briefing: string; data: BriefingData } | null> {
  const data = await gatherBriefingData(supabase, userId);
  if (!data) return null;

  const context = formatBriefingContext(data);

  try {
    const response = await anthropic.messages.create({
      model: getModel("fast"),
      max_tokens: 600,
      system: BRIEFING_PROMPT,
      messages: [{ role: "user", content: context }],
    });

    const briefing = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    return { briefing, data };
  } catch (err) {
    console.error("[briefing] AI generation failed:", err);
    return null;
  }
}

/**
 * Generate an AI-powered weekly review for a user.
 */
export async function generateWeeklyReview(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ review: string; data: WeeklyData } | null> {
  const data = await gatherWeeklyData(supabase, userId);
  if (!data) return null;

  const context = formatWeeklyContext(data);

  try {
    const response = await anthropic.messages.create({
      model: getModel("smart"), // weekly reviews get the smart model
      max_tokens: 800,
      system: WEEKLY_PROMPT,
      messages: [{ role: "user", content: context }],
    });

    const review = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    return { review, data };
  } catch (err) {
    console.error("[briefing] Weekly review AI generation failed:", err);
    return null;
  }
}

// ─── Data Gathering ──────────────────────────────────────────

async function gatherBriefingData(
  supabase: SupabaseClient,
  userId: string,
): Promise<BriefingData | null> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  // Get user name
  const { data: userRec } = await platform(supabase)
    .from("users")
    .select("display_name, full_name")
    .eq("id", userId)
    .single();

  const userName = userRec?.display_name || userRec?.full_name || "there";

  // Get open status IDs
  const { data: activeStatuses } = await config(supabase)
    .from("task_statuses")
    .select("id, name")
    .eq("active", true);

  const terminalNames = new Set(["done", "shipped", "completed", "abandoned", "cancelled"]);
  const openStatusIds = (activeStatuses || [])
    .filter((s) => !terminalNames.has(s.name.toLowerCase()))
    .map((s) => s.id);

  // Parallel data fetch
  const [
    overdueRes,
    todayRes,
    tomorrowRes,
    habitsRes,
    checkInsRes,
    goalsRes,
    suggestionsRes,
    crawlerRes,
    xpRes,
    completionsRes,
  ] = await Promise.all([
    // Overdue tasks
    platform(supabase)
      .from("tasks")
      .select("title, due_date")
      .lt("due_date", todayStr)
      .in("status_id", openStatusIds.length > 0 ? openStatusIds : ["__none__"])
      .contains("owner_ids", [userId])
      .order("due_date", { ascending: true })
      .limit(10),
    // Today tasks
    platform(supabase)
      .from("tasks")
      .select("title")
      .eq("due_date", todayStr)
      .in("status_id", openStatusIds.length > 0 ? openStatusIds : ["__none__"])
      .contains("owner_ids", [userId])
      .limit(10),
    // Tomorrow tasks
    platform(supabase)
      .from("tasks")
      .select("title")
      .eq("due_date", tomorrowStr)
      .in("status_id", openStatusIds.length > 0 ? openStatusIds : ["__none__"])
      .contains("owner_ids", [userId])
      .limit(5),
    // Active habits
    platform(supabase)
      .from("habits")
      .select("id, title, current_streak")
      .eq("owner_id", userId)
      .eq("status", "active"),
    // Today's habit check-ins
    platform(supabase)
      .from("habit_check_ins")
      .select("habit_id")
      .eq("checked_by", userId)
      .eq("check_date", todayStr),
    // Active goals
    platform(supabase)
      .from("goals")
      .select("title, progress_value, target_value")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(5),
    // Pending suggestions
    platform(supabase)
      .from("ai_suggestions")
      .select("title, category")
      .eq("user_id", userId)
      .eq("status", "pending")
      .limit(3),
    // Crawler profile
    platform(supabase)
      .from("crawler_profiles")
      .select("level, total_xp")
      .eq("user_id", userId)
      .single(),
    // XP earned today
    platform(supabase)
      .from("xp_ledger")
      .select("amount")
      .eq("user_id", userId)
      .gte("created_at", todayStr),
    // Recent completions (last 24h)
    platform(supabase)
      .from("tasks")
      .select("title")
      .contains("owner_ids", [userId])
      .gte("completed_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
      .not("completed_at", "is", null)
      .limit(5),
  ]);

  const overdueTasks = overdueRes.data || [];
  const todayTasks = todayRes.data || [];
  const habits = habitsRes.data || [];
  const checkIns = checkInsRes.data || [];
  const checkedHabitIds = new Set(checkIns.map((c) => c.habit_id));

  // Habit streaks (top 3 by streak length)
  const habitStreaks = habits
    .filter((h) => h.current_streak > 0)
    .sort((a, b) => b.current_streak - a.current_streak)
    .slice(0, 3)
    .map((h) => ({ title: h.title, streak: h.current_streak }));

  // Goals with progress percentage
  const activeGoals = (goalsRes.data || []).map((g) => ({
    title: g.title,
    progress: g.target_value > 0 ? Math.round((g.progress_value / g.target_value) * 100) : 0,
  }));

  // Get partner data
  let partnerName: string | null = null;
  let partnerOverdue = 0;
  let partnerTodayTasks = 0;
  let partnerHabitsUnchecked = 0;

  const { getHouseholdContext, getHouseholdMemberIds } = await import("@/lib/household");
  const ctx = await getHouseholdContext(supabase, userId);
  if (ctx) {
    const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
    const otherIds = memberIds.filter((id) => id !== userId);
    if (otherIds.length > 0) {
      const partnerId = otherIds[0];
      const { data: partnerRec } = await platform(supabase)
        .from("users")
        .select("display_name, full_name")
        .eq("id", partnerId)
        .single();
      partnerName = partnerRec?.display_name || partnerRec?.full_name || null;

      // Partner's overdue + today
      const [pOverdue, pToday, pHabits, pCheckIns] = await Promise.all([
        platform(supabase)
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .lt("due_date", todayStr)
          .in("status_id", openStatusIds.length > 0 ? openStatusIds : ["__none__"])
          .contains("owner_ids", [partnerId]),
        platform(supabase)
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("due_date", todayStr)
          .in("status_id", openStatusIds.length > 0 ? openStatusIds : ["__none__"])
          .contains("owner_ids", [partnerId]),
        platform(supabase)
          .from("habits")
          .select("id")
          .eq("owner_id", partnerId)
          .eq("status", "active"),
        platform(supabase)
          .from("habit_check_ins")
          .select("habit_id")
          .eq("checked_by", partnerId)
          .eq("check_date", todayStr),
      ]);

      partnerOverdue = pOverdue.count || 0;
      partnerTodayTasks = pToday.count || 0;
      const partnerHabitCount = pHabits.data?.length || 0;
      const partnerCheckedCount = pCheckIns.data?.length || 0;
      partnerHabitsUnchecked = Math.max(0, partnerHabitCount - partnerCheckedCount);
    }
  }

  // Behavioral trends: compare last 7 days vs prior 7 days
  const trends = await gatherTrendData(supabase, userId);

  return {
    userName,
    partnerName,
    overdueTaskCount: overdueTasks.length,
    overdueTasks,
    todayTaskCount: todayTasks.length,
    todayTasks,
    tomorrowTaskCount: tomorrowRes.data?.length || 0,
    habitsDue: habits.length,
    habitsChecked: checkIns.length,
    habitStreaks,
    activeGoals,
    pendingSuggestions: suggestionsRes.data || [],
    crawlerLevel: crawlerRes.data?.level || null,
    xpToday: (xpRes.data || []).reduce((sum, x) => sum + (x.amount || 0), 0),
    partnerOverdue,
    partnerTodayTasks,
    partnerHabitsUnchecked,
    recentCompletions: (completionsRes.data || []).map((t) => t.title),
    trends,
  };
}

export async function gatherTrendData(
  supabase: SupabaseClient,
  userId: string,
): Promise<TrendData | null> {
  try {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const weekAgoStr = weekAgo.toISOString().slice(0, 10);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    // Fetch behavioral aggregates for both periods
    const [thisWeekRes, lastWeekRes, tasksThisRes, tasksLastRes] = await Promise.all([
      platform(supabase)
        .from("behavioral_aggregates")
        .select("habits_checked, habits_missed, xp_earned")
        .eq("user_id", userId)
        .gte("date", weekAgoStr)
        .lt("date", todayStr),
      platform(supabase)
        .from("behavioral_aggregates")
        .select("habits_checked, habits_missed, xp_earned")
        .eq("user_id", userId)
        .gte("date", twoWeeksAgoStr)
        .lt("date", weekAgoStr),
      platform(supabase)
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .contains("owner_ids", [userId])
        .gte("completed_at", weekAgoStr)
        .not("completed_at", "is", null),
      platform(supabase)
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .contains("owner_ids", [userId])
        .gte("completed_at", twoWeeksAgoStr)
        .lt("completed_at", weekAgoStr)
        .not("completed_at", "is", null),
    ]);

    const thisAgg = thisWeekRes.data || [];
    const lastAgg = lastWeekRes.data || [];

    const thisChecked = thisAgg.reduce((s, a) => s + (a.habits_checked || 0), 0);
    const thisMissed = thisAgg.reduce((s, a) => s + (a.habits_missed || 0), 0);
    const thisTotal = thisChecked + thisMissed;
    const habitRateThis = thisTotal > 0 ? Math.round((thisChecked / thisTotal) * 100) : 0;

    const lastChecked = lastAgg.reduce((s, a) => s + (a.habits_checked || 0), 0);
    const lastMissed = lastAgg.reduce((s, a) => s + (a.habits_missed || 0), 0);
    const lastTotal = lastChecked + lastMissed;
    const habitRateLast = lastTotal > 0 ? Math.round((lastChecked / lastTotal) * 100) : 0;

    const xpThis = thisAgg.reduce((s, a) => s + (a.xp_earned || 0), 0);
    const xpLast = lastAgg.reduce((s, a) => s + (a.xp_earned || 0), 0);

    const tasksCompletedThis = tasksThisRes.count || 0;
    const tasksCompletedLast = tasksLastRes.count || 0;

    // Generate alert if significant changes detected
    const alerts: string[] = [];

    if (lastTotal > 0 && thisTotal > 0) {
      const habitDelta = habitRateThis - habitRateLast;
      if (habitDelta <= -20) {
        alerts.push(`Habit check-ins dropped ${Math.abs(habitDelta)}% from last week (${habitRateLast}% -> ${habitRateThis}%)`);
      } else if (habitDelta >= 15) {
        alerts.push(`Habit consistency up ${habitDelta}% from last week — nice momentum`);
      }
    }

    if (tasksCompletedLast > 0) {
      const taskDelta = tasksCompletedThis - tasksCompletedLast;
      const taskPct = Math.round((taskDelta / tasksCompletedLast) * 100);
      if (taskPct <= -40 && tasksCompletedLast >= 3) {
        alerts.push(`Task completions down ${Math.abs(taskPct)}% vs last week (${tasksCompletedLast} -> ${tasksCompletedThis})`);
      } else if (taskPct >= 30 && tasksCompletedThis >= 3) {
        alerts.push(`Task throughput up ${taskPct}% — crushing it`);
      }
    }

    if (xpLast > 0) {
      const xpDelta = xpThis - xpLast;
      const xpPct = Math.round((xpDelta / xpLast) * 100);
      if (xpPct <= -50 && xpLast >= 50) {
        alerts.push(`XP earning slowed significantly (${xpLast} -> ${xpThis})`);
      }
    }

    return {
      habitRateThis,
      habitRateLast,
      tasksCompletedThis,
      tasksCompletedLast,
      xpThis,
      xpLast,
      alert: alerts.length > 0 ? alerts.join(". ") : null,
    };
  } catch {
    return null;
  }
}

async function gatherWeeklyData(
  supabase: SupabaseClient,
  userId: string,
): Promise<WeeklyData | null> {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);

  // Get user name
  const { data: userRec } = await platform(supabase)
    .from("users")
    .select("display_name, full_name")
    .eq("id", userId)
    .single();

  const userName = userRec?.display_name || userRec?.full_name || "there";

  // Parallel queries
  const [
    completedRes,
    createdRes,
    aggregatesRes,
    crawlerRes,
    habitsRes,
    goalsRes,
    achievementsRes,
    patternsRes,
    suggestionsRes,
  ] = await Promise.all([
    // Tasks completed this week
    platform(supabase)
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .contains("owner_ids", [userId])
      .gte("completed_at", weekAgoStr)
      .not("completed_at", "is", null),
    // Tasks created this week
    platform(supabase)
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .contains("owner_ids", [userId])
      .gte("created_at", weekAgoStr),
    // Behavioral aggregates for the week
    platform(supabase)
      .from("behavioral_aggregates")
      .select("habits_checked, habits_missed, xp_earned")
      .eq("user_id", userId)
      .gte("date", weekAgoStr),
    // Crawler profile
    platform(supabase)
      .from("crawler_profiles")
      .select("level")
      .eq("user_id", userId)
      .single(),
    // Active habits with streaks
    platform(supabase)
      .from("habits")
      .select("current_streak")
      .eq("owner_id", userId)
      .eq("status", "active"),
    // Active goals
    platform(supabase)
      .from("goals")
      .select("title, progress_value, target_value")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(5),
    // Achievements unlocked this week
    platform(supabase)
      .from("achievement_unlocks")
      .select("achievement_slug")
      .eq("user_id", userId)
      .gte("unlocked_at", weekAgoStr),
    // New patterns detected
    platform(supabase)
      .from("detected_patterns")
      .select("description")
      .eq("user_id", userId)
      .eq("is_active", true)
      .gte("created_at", weekAgoStr)
      .limit(3),
    // Pending suggestions
    platform(supabase)
      .from("ai_suggestions")
      .select("title, category")
      .eq("user_id", userId)
      .eq("status", "pending")
      .limit(3),
  ]);

  const aggregates = aggregatesRes.data || [];
  const totalHabitsChecked = aggregates.reduce((s, a) => s + (a.habits_checked || 0), 0);
  const totalHabitsMissed = aggregates.reduce((s, a) => s + (a.habits_missed || 0), 0);
  const totalXp = aggregates.reduce((s, a) => s + (a.xp_earned || 0), 0);
  const habitTotal = totalHabitsChecked + totalHabitsMissed;
  const habitRate = habitTotal > 0 ? Math.round((totalHabitsChecked / habitTotal) * 100) : 0;

  const activeHabits = habitsRes.data || [];
  const activeStreaks = activeHabits.filter((h) => h.current_streak > 0).length;
  const brokenStreaks = activeHabits.filter((h) => h.current_streak === 0).length;

  // Goals progress (simple — just current values)
  const goalsProgress = (goalsRes.data || []).map((g) => ({
    title: g.title,
    delta: 0, // Would need last week's snapshot to compute delta
    current: g.target_value > 0 ? Math.round((g.progress_value / g.target_value) * 100) : 0,
  }));

  // Partner data
  let partnerName: string | null = null;
  let partnerTasksCompleted = 0;
  let partnerHabitRate = 0;
  let householdTasksCompleted = completedRes.count || 0;

  const { getHouseholdContext, getHouseholdMemberIds } = await import("@/lib/household");
  const ctx = await getHouseholdContext(supabase, userId);
  if (ctx) {
    const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
    const otherIds = memberIds.filter((id) => id !== userId);
    if (otherIds.length > 0) {
      const partnerId = otherIds[0];
      const { data: partnerRec } = await platform(supabase)
        .from("users")
        .select("display_name, full_name")
        .eq("id", partnerId)
        .single();
      partnerName = partnerRec?.display_name || partnerRec?.full_name || null;

      const [pCompleted, pAggregates] = await Promise.all([
        platform(supabase)
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .contains("owner_ids", [partnerId])
          .gte("completed_at", weekAgoStr)
          .not("completed_at", "is", null),
        platform(supabase)
          .from("behavioral_aggregates")
          .select("habits_checked, habits_missed")
          .eq("user_id", partnerId)
          .gte("date", weekAgoStr),
      ]);

      partnerTasksCompleted = pCompleted.count || 0;
      householdTasksCompleted += partnerTasksCompleted;

      const pAgg = pAggregates.data || [];
      const pChecked = pAgg.reduce((s, a) => s + (a.habits_checked || 0), 0);
      const pMissed = pAgg.reduce((s, a) => s + (a.habits_missed || 0), 0);
      const pTotal = pChecked + pMissed;
      partnerHabitRate = pTotal > 0 ? Math.round((pChecked / pTotal) * 100) : 0;
    }
  }

  return {
    userName,
    partnerName,
    tasksCompleted: completedRes.count || 0,
    tasksCreated: createdRes.count || 0,
    habitsCompletionRate: habitRate,
    xpEarned: totalXp,
    currentLevel: crawlerRes.data?.level || null,
    streaksActive: activeStreaks,
    streaksBroken: brokenStreaks,
    goalsProgress,
    topAchievements: (achievementsRes.data || []).map((a) => a.achievement_slug),
    partnerTasksCompleted,
    partnerHabitRate,
    householdTasksCompleted,
    newPatterns: (patternsRes.data || []).map((p) => p.description),
    pendingSuggestions: suggestionsRes.data || [],
  };
}

// ─── Context Formatters ──────────────────────────────────────

function formatBriefingContext(data: BriefingData): string {
  const parts: string[] = [`User: ${data.userName}`];

  if (data.overdueTaskCount > 0) {
    const tasks = data.overdueTasks.slice(0, 5).map((t) => `  - ${t.title} (due ${t.due_date})`).join("\n");
    parts.push(`OVERDUE TASKS (${data.overdueTaskCount}):\n${tasks}`);
  }

  if (data.todayTaskCount > 0) {
    const tasks = data.todayTasks.slice(0, 5).map((t) => `  - ${t.title}`).join("\n");
    parts.push(`DUE TODAY (${data.todayTaskCount}):\n${tasks}`);
  }

  if (data.tomorrowTaskCount > 0) {
    parts.push(`Due tomorrow: ${data.tomorrowTaskCount} tasks`);
  }

  parts.push(`Habits: ${data.habitsChecked}/${data.habitsDue} checked in today`);

  if (data.habitStreaks.length > 0) {
    const streaks = data.habitStreaks.map((h) => `${h.title} (${h.streak}-day streak)`).join(", ");
    parts.push(`Active streaks: ${streaks}`);
  }

  if (data.activeGoals.length > 0) {
    const goals = data.activeGoals.map((g) => `${g.title} (${g.progress}%)`).join(", ");
    parts.push(`Active goals: ${goals}`);
  }

  if (data.recentCompletions.length > 0) {
    parts.push(`Completed recently: ${data.recentCompletions.join(", ")}`);
  }

  if (data.crawlerLevel) {
    parts.push(`Crawler level: ${data.crawlerLevel}, XP today: ${data.xpToday}`);
  }

  // Household context
  if (data.partnerName) {
    const partnerNotes: string[] = [];
    if (data.partnerOverdue > 0) partnerNotes.push(`${data.partnerOverdue} overdue tasks`);
    if (data.partnerTodayTasks > 0) partnerNotes.push(`${data.partnerTodayTasks} tasks today`);
    if (data.partnerHabitsUnchecked > 0) partnerNotes.push(`${data.partnerHabitsUnchecked} habits unchecked`);
    if (partnerNotes.length > 0) {
      parts.push(`\n${data.partnerName}'s status: ${partnerNotes.join(", ")}`);
    } else {
      parts.push(`\n${data.partnerName}: all clear today`);
    }
  }

  if (data.pendingSuggestions.length > 0) {
    parts.push(`\nPending suggestion: ${data.pendingSuggestions[0].title}`);
  }

  // Behavioral trends — week-over-week signals
  if (data.trends?.alert) {
    parts.push(`\nTREND ALERT: ${data.trends.alert}`);
  }

  return parts.join("\n");
}

function formatWeeklyContext(data: WeeklyData): string {
  const parts: string[] = [`User: ${data.userName}`];

  parts.push(`Tasks: ${data.tasksCompleted} completed, ${data.tasksCreated} created`);
  parts.push(`Habit completion rate: ${data.habitsCompletionRate}%`);
  parts.push(`XP earned: ${data.xpEarned}`);
  if (data.currentLevel) parts.push(`Current level: ${data.currentLevel}`);
  parts.push(`Streaks: ${data.streaksActive} active, ${data.streaksBroken} at zero`);

  if (data.goalsProgress.length > 0) {
    const goals = data.goalsProgress.map((g) => `${g.title}: ${g.current}%`).join(", ");
    parts.push(`Goals: ${goals}`);
  }

  if (data.topAchievements.length > 0) {
    parts.push(`Achievements unlocked: ${data.topAchievements.join(", ")}`);
  }

  // Household
  if (data.partnerName) {
    parts.push(`\nHousehold (${data.userName} + ${data.partnerName}):`);
    parts.push(`Combined tasks completed: ${data.householdTasksCompleted}`);
    parts.push(`${data.partnerName}: ${data.partnerTasksCompleted} tasks, ${data.partnerHabitRate}% habits`);
  }

  if (data.newPatterns.length > 0) {
    parts.push(`\nNew patterns detected: ${data.newPatterns.join("; ")}`);
  }

  if (data.pendingSuggestions.length > 0) {
    const sugs = data.pendingSuggestions.map((s) => s.title).join(", ");
    parts.push(`Pending suggestions: ${sugs}`);
  }

  return parts.join("\n");
}
