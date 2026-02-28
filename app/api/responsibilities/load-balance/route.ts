// ============================================================
// FILE: app/api/responsibilities/load-balance/route.ts
// PURPOSE: Household load balance — compute and view effort distribution
//          AI uses this to suggest rebalancing. Also stores snapshots.
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";

// GET /api/responsibilities/load-balance — compute current load distribution
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({ error: "No household found" }, { status: 404 });
  }

  // Fetch all responsibilities with effort weights
  const { data: responsibilities } = await platform(supabase)
    .from("responsibilities")
    .select("id, name, category, current_owner_id, effort_weight, ownership_type")
    .eq("household_id", ctx.household_id);

  if (!responsibilities || responsibilities.length === 0) {
    return NextResponse.json({
      load_balance: [],
      total_effort: 0,
      message: "No responsibilities assigned yet",
    });
  }

  // Fetch household members
  const { data: members } = await platform(supabase)
    .from("household_members")
    .select("user_id, display_name")
    .eq("household_id", ctx.household_id);

  // Compute effort per member
  const totalEffort = responsibilities.reduce((sum, r) => sum + (r.effort_weight || 0), 0);

  const memberMap = new Map<string, {
    user_id: string;
    display_name: string | null;
    total_effort: number;
    responsibility_count: number;
    categories: Record<string, number>;
    responsibilities: Array<{ id: string; name: string; effort_weight: number; category: string }>;
  }>();

  // Initialize all members
  for (const m of (members || [])) {
    memberMap.set(m.user_id, {
      user_id: m.user_id,
      display_name: m.display_name,
      total_effort: 0,
      responsibility_count: 0,
      categories: {},
      responsibilities: [],
    });
  }

  // Tally responsibilities
  for (const r of responsibilities) {
    const entry = memberMap.get(r.current_owner_id);
    if (entry) {
      entry.total_effort += r.effort_weight || 0;
      entry.responsibility_count += 1;
      entry.categories[r.category] = (entry.categories[r.category] || 0) + (r.effort_weight || 0);
      entry.responsibilities.push({
        id: r.id,
        name: r.name,
        effort_weight: r.effort_weight,
        category: r.category,
      });
    }
  }

  // Calculate percentages
  const loadBalance = Array.from(memberMap.values()).map((m) => ({
    ...m,
    household_share_pct: totalEffort > 0
      ? Math.round((m.total_effort / totalEffort) * 100)
      : 0,
  }));

  return NextResponse.json({
    load_balance: loadBalance,
    total_effort: totalEffort,
    total_responsibilities: responsibilities.length,
  });
}

// POST /api/responsibilities/load-balance — save a snapshot (called by AI or manual)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({ error: "No household found" }, { status: 404 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const now = new Date();
  const periodStart = body.period_start || now.toISOString().split("T")[0];
  const periodEnd = body.period_end || periodStart;

  // Compute current load for all members
  const { data: responsibilities } = await platform(supabase)
    .from("responsibilities")
    .select("current_owner_id, effort_weight")
    .eq("household_id", ctx.household_id);

  if (!responsibilities) {
    return NextResponse.json({ error: "Failed to compute load" }, { status: 500 });
  }

  const { data: members } = await platform(supabase)
    .from("household_members")
    .select("user_id")
    .eq("household_id", ctx.household_id);

  const totalEffort = responsibilities.reduce((sum, r) => sum + (r.effort_weight || 0), 0);

  // Create snapshots for each member
  const snapshots = (members || []).map((m) => {
    const memberResponsibilities = responsibilities.filter(
      (r) => r.current_owner_id === m.user_id
    );
    const memberEffort = memberResponsibilities.reduce(
      (sum, r) => sum + (r.effort_weight || 0),
      0
    );

    return {
      household_id: ctx.household_id,
      user_id: m.user_id,
      period_start: periodStart,
      period_end: periodEnd,
      total_effort_score: memberEffort,
      responsibility_count: memberResponsibilities.length,
      household_share_pct: totalEffort > 0
        ? Math.round((memberEffort / totalEffort) * 100)
        : 0,
      breakdown: { by_effort: memberResponsibilities },
      computed_by: body.computed_by || "manual",
    };
  });

  const { data: saved, error } = await platform(supabase)
    .from("load_snapshots")
    .insert(snapshots)
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ snapshots: saved }, { status: 201 });
}
