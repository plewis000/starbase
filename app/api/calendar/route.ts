import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext, getHouseholdMemberIds } from "@/lib/household";

export interface CalendarItem {
  type: "task" | "goal" | "goal_milestone" | "habit" | "birthday" | "anniversary" | "life_event";
  id: string;
  title: string;
  date: string;
  endDate?: string;
  color?: string;
  meta?: Record<string, unknown>;
}

// GET /api/calendar?start=2026-03-01&end=2026-03-31
export const GET = withUser(async (request: NextRequest, { supabase, user }) => {
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "start and end params required (YYYY-MM-DD)" }, { status: 400 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  const memberIds = ctx
    ? await getHouseholdMemberIds(supabase, ctx.household_id)
    : [user.id];
  const items: CalendarItem[] = [];

  // 1. Tasks with due_date in range
  try {
    const { data: tasks } = await platform(supabase)
      .from("tasks")
      .select("id, title, due_date, status_id, priority_id, completed_at, is_habit, recurrence_rule")
      .gte("due_date", start)
      .lte("due_date", end)
      .in("created_by", memberIds);

    for (const t of tasks || []) {
      items.push({
        type: t.is_habit || t.recurrence_rule ? "habit" : "task",
        id: t.id,
        title: t.title,
        date: t.due_date,
        color: t.completed_at ? "#22c55e" : t.is_habit || t.recurrence_rule ? "#8b5cf6" : "#ef4444",
        meta: { status_id: t.status_id, completed: !!t.completed_at },
      });
    }
  } catch { /* tasks table may not exist */ }

  // 2. Goals with target_date in range
  try {
    const { data: goals } = await platform(supabase)
      .from("goals")
      .select("id, title, target_date, status, progress_value")
      .gte("target_date", start)
      .lte("target_date", end)
      .eq("owner_id", user.id)
      .eq("status", "active");

    for (const g of goals || []) {
      items.push({
        type: "goal",
        id: g.id,
        title: g.title,
        date: g.target_date,
        color: "#f59e0b",
        meta: { progress: g.progress_value },
      });
    }
  } catch { /* silent */ }

  // 3. Goal milestones (scoped to user's goals)
  try {
    // Get user's goal IDs first, then filter milestones
    const { data: userGoals } = await platform(supabase)
      .from("goals")
      .select("id")
      .eq("owner_id", user.id);
    const userGoalIds = (userGoals || []).map(g => g.id);

    const { data: milestones } = userGoalIds.length > 0
      ? await platform(supabase)
          .from("goal_milestones")
          .select("id, title, target_date, completed_at, goal_id")
          .in("goal_id", userGoalIds)
          .gte("target_date", start)
          .lte("target_date", end)
      : { data: [] };

    for (const m of milestones || []) {
      items.push({
        type: "goal_milestone",
        id: m.id,
        title: m.title,
        date: m.target_date,
        color: "#f59e0b",
        meta: { goal_id: m.goal_id, completed: !!m.completed_at },
      });
    }
  } catch { /* silent */ }

  // 4. Active habits (tasks with is_habit=true) — expand scheduled dates in range
  try {
    const { data: habits } = await platform(supabase)
      .from("tasks")
      .select("id, title, recurrence_rule, start_date")
      .eq("is_habit", true)
      .contains("owner_ids", [user.id])
      .is("completed_at", null);

    const startDate = new Date(start);
    const endDate = new Date(end);

    for (const h of habits || []) {
      const rrule = (h.recurrence_rule as string) || "";
      // Parse BYDAY from RRULE to get specific days (e.g., BYDAY=MO,WE,FR)
      const byDayMatch = rrule.match(/BYDAY=([A-Z,]+)/);
      const rruleDayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
      const allowedDays = byDayMatch
        ? byDayMatch[1].split(",").map(d => rruleDayMap[d]).filter(d => d !== undefined)
        : null;

      // Determine frequency
      const isDaily = rrule.includes("FREQ=DAILY") || !rrule;
      const isWeekly = rrule.includes("FREQ=WEEKLY");
      const isMonthly = rrule.includes("FREQ=MONTHLY");
      const habitStartDay = h.start_date ? new Date(h.start_date + "T00:00:00").getDate() : 1;

      const current = new Date(startDate);
      while (current <= endDate) {
        const dayOfWeek = current.getDay();
        let shouldShow = false;
        if (isDaily) {
          shouldShow = true;
        } else if (isWeekly && allowedDays) {
          shouldShow = allowedDays.includes(dayOfWeek);
        } else if (isWeekly) {
          shouldShow = true; // weekly without BYDAY — show every day
        } else if (isMonthly) {
          shouldShow = current.getDate() === habitStartDay;
        }
        if (shouldShow) {
          items.push({
            type: "habit",
            id: h.id,
            title: h.title,
            date: current.toISOString().split("T")[0],
            color: "#8b5cf6",
          });
        }
        current.setDate(current.getDate() + 1);
      }
    }
  } catch { /* silent */ }

  // 5. Contact birthdays/anniversaries matching month/day in range
  try {
    const { data: contacts } = await platform(supabase)
      .from("contacts")
      .select("id, full_name, birthday, anniversary")
      .eq("user_id", user.id);

    const year = start.slice(0, 4);

    for (const c of contacts || []) {
      if (c.birthday) {
        const bMonth = parseInt(c.birthday.slice(5, 7));
        const bDay = parseInt(c.birthday.slice(8, 10));
        const thisYearDate = `${year}-${String(bMonth).padStart(2, "0")}-${String(bDay).padStart(2, "0")}`;
        if (thisYearDate >= start && thisYearDate <= end) {
          items.push({
            type: "birthday",
            id: c.id,
            title: `${c.full_name}'s Birthday`,
            date: thisYearDate,
            color: "#ec4899",
          });
        }
      }
      if (c.anniversary) {
        const aMonth = parseInt(c.anniversary.slice(5, 7));
        const aDay = parseInt(c.anniversary.slice(8, 10));
        const thisYearDate = `${year}-${String(aMonth).padStart(2, "0")}-${String(aDay).padStart(2, "0")}`;
        if (thisYearDate >= start && thisYearDate <= end) {
          items.push({
            type: "anniversary",
            id: c.id,
            title: `${c.full_name}'s Anniversary`,
            date: thisYearDate,
            color: "#f472b6",
          });
        }
      }
    }
  } catch { /* silent */ }

  // 6. Life events overlapping range
  try {
    const householdId = ctx?.household_id;
    let query = platform(supabase)
      .from("life_events")
      .select("id, title, started_at, ends_at, event_type")
      .eq("active", true)
      .lte("started_at", end);

    if (householdId) {
      query = query.or(`user_id.eq.${user.id},household_id.eq.${householdId}`);
    } else {
      query = query.eq("user_id", user.id);
    }

    const { data: events } = await query;

    for (const e of events || []) {
      const eventEnd = e.ends_at || e.started_at;
      if (eventEnd >= start) {
        items.push({
          type: "life_event",
          id: e.id,
          title: e.title,
          date: e.started_at,
          endDate: e.ends_at || undefined,
          color: "#06b6d4",
          meta: { event_type: e.event_type },
        });
      }
    }
  } catch { /* silent */ }

  return NextResponse.json({ items });
});
