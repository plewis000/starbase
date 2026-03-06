// Activity API: GET /api/activity/config — Fetch task config (statuses, priorities, members)

import { NextRequest, NextResponse } from "next/server";
import { authenticateActivity } from "@/lib/discord-activity-auth";
import { config, platform } from "@/lib/supabase/schemas";

export async function GET(request: NextRequest) {
  const auth = await authenticateActivity(request.headers.get("Authorization"));
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, householdId } = auth;

  const [statuses, priorities, members] = await Promise.all([
    config(supabase).from("task_statuses").select("*").order("sort_order"),
    config(supabase).from("task_priorities").select("*").order("sort_order"),
    platform(supabase)
      .from("household_members")
      .select("user_id, display_name, role")
      .eq("household_id", householdId),
  ]);

  // Fetch user details for members
  const memberUserIds = (members.data || []).map((m) => m.user_id);
  const { data: users } = await platform(supabase)
    .from("users")
    .select("id, full_name, email, avatar_url")
    .in("id", memberUserIds);

  const usersMap = new Map((users || []).map((u) => [u.id, u]));
  const enrichedMembers = (members.data || []).map((m) => ({
    ...m,
    user: usersMap.get(m.user_id) || null,
  }));

  return NextResponse.json({
    statuses: statuses.data || [],
    priorities: priorities.data || [],
    members: enrichedMembers,
  });
}
