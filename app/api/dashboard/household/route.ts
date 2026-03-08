import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext, getHouseholdMemberIds } from "@/lib/household";

// GET: Household-level dashboard — combined metrics for all members

export const GET = withUser(async (_request, { supabase, user }) => {
  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household found" }, { status: 404 });

  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const today = new Date().toISOString().slice(0, 10);

  // Get member profiles
  const { data: members } = await platform(supabase)
    .from("users")
    .select("id, full_name")
    .in("id", memberIds);

  // Per-member parallel data fetch
  const memberData = await Promise.all(
    (members || []).map(async (member) => {
      const name = member.full_name || "Unknown";

      const [
        overdueRes,
        openRes,
        completedWeekRes,
        habitsRes,
        checkInsRes,
        crawlerRes,
        streaksRes,
      ] = await Promise.all([
        // Overdue tasks
        platform(supabase)
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .contains("owner_ids", [member.id])
          .lt("due_date", today)
          .is("completed_at", null),
        // Open tasks
        platform(supabase)
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .contains("owner_ids", [member.id])
          .is("completed_at", null),
        // Completed this week
        (() => {
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          return platform(supabase)
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .contains("owner_ids", [member.id])
            .gte("completed_at", weekAgo.toISOString())
            .not("completed_at", "is", null);
        })(),
        // Active habits
        platform(supabase)
          .from("habits")
          .select("id, title, current_streak")
          .eq("owner_id", member.id)
          .eq("status", "active"),
        // Today's check-ins
        platform(supabase)
          .from("habit_check_ins")
          .select("habit_id")
          .eq("checked_by", member.id)
          .eq("check_date", today),
        // Crawler profile
        platform(supabase)
          .from("crawler_profiles")
          .select("level, total_xp")
          .eq("user_id", member.id)
          .single(),
        // Top streaks
        platform(supabase)
          .from("habits")
          .select("title, current_streak")
          .eq("owner_id", member.id)
          .eq("status", "active")
          .gt("current_streak", 0)
          .order("current_streak", { ascending: false })
          .limit(3),
      ]);

      const habits = habitsRes.data || [];
      const checkedIds = new Set((checkInsRes.data || []).map(c => c.habit_id));
      const habitsChecked = habits.filter(h => checkedIds.has(h.id)).length;
      const habitsTotal = habits.length;
      const habitRate = habitsTotal > 0 ? Math.round((habitsChecked / habitsTotal) * 100) : 0;

      return {
        id: member.id,
        name,
        is_current_user: member.id === user.id,
        tasks: {
          overdue: overdueRes.count || 0,
          open: openRes.count || 0,
          completed_this_week: completedWeekRes.count || 0,
        },
        habits: {
          total: habitsTotal,
          checked_today: habitsChecked,
          rate: habitRate,
          top_streaks: (streaksRes.data || []).map(h => ({
            title: h.title,
            streak: h.current_streak,
          })),
        },
        crawler: crawlerRes.data ? {
          level: crawlerRes.data.level,
          xp: crawlerRes.data.total_xp,
        } : null,
      };
    })
  );

  // Household combined metrics
  const totalOverdue = memberData.reduce((s, m) => s + m.tasks.overdue, 0);
  const totalOpen = memberData.reduce((s, m) => s + m.tasks.open, 0);
  const totalCompleted = memberData.reduce((s, m) => s + m.tasks.completed_this_week, 0);
  const totalHabitsChecked = memberData.reduce((s, m) => s + m.habits.checked_today, 0);
  const totalHabitsTotal = memberData.reduce((s, m) => s + m.habits.total, 0);
  const combinedHabitRate = totalHabitsTotal > 0 ? Math.round((totalHabitsChecked / totalHabitsTotal) * 100) : 0;

  // Workload imbalance
  const openCounts = memberData.map(m => m.tasks.open);
  const imbalance = openCounts.length >= 2 ? Math.max(...openCounts) - Math.min(...openCounts) : 0;

  // Weekly behavioral aggregates for trend sparkline
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: weekAggs } = await platform(supabase)
    .from("behavioral_aggregates")
    .select("user_id, date, tasks_completed, habits_checked, habits_missed, xp_earned")
    .in("user_id", memberIds)
    .gte("date", weekAgo.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  // Build daily household totals for sparkline
  const dailyTotals: { date: string; tasks: number; habits_rate: number; xp: number }[] = [];
  const dateMap = new Map<string, { tasks: number; checked: number; missed: number; xp: number }>();
  for (const a of weekAggs || []) {
    const existing = dateMap.get(a.date) || { tasks: 0, checked: 0, missed: 0, xp: 0 };
    existing.tasks += a.tasks_completed || 0;
    existing.checked += a.habits_checked || 0;
    existing.missed += a.habits_missed || 0;
    existing.xp += a.xp_earned || 0;
    dateMap.set(a.date, existing);
  }
  for (const [date, totals] of dateMap) {
    const total = totals.checked + totals.missed;
    dailyTotals.push({
      date,
      tasks: totals.tasks,
      habits_rate: total > 0 ? Math.round((totals.checked / total) * 100) : 0,
      xp: totals.xp,
    });
  }

  return NextResponse.json({
    members: memberData,
    household: {
      total_overdue: totalOverdue,
      total_open: totalOpen,
      completed_this_week: totalCompleted,
      habit_rate: combinedHabitRate,
      workload_imbalance: imbalance,
      balance_status: imbalance > 5 ? "unbalanced" : imbalance > 2 ? "slightly_off" : "balanced",
    },
    weekly_trend: dailyTotals,
  });
});
