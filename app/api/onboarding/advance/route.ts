// ============================================================
// FILE: app/api/onboarding/advance/route.ts
// PURPOSE: Manually advance onboarding phase
//          observation → refinement → active
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import { validateEnum } from "@/lib/validation";
import type { OnboardingPhase } from "@/lib/types";

const VALID_PHASES: readonly OnboardingPhase[] = [
  "not_started", "interview", "observation", "refinement", "active",
] as const;

// Valid transitions: observation → refinement, refinement → active
const VALID_TRANSITIONS: Record<string, string> = {
  observation: "refinement",
  refinement: "active",
};

// POST /api/onboarding/advance — advance to next phase
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

  const { data: state } = await platform(supabase)
    .from("onboarding_state")
    .select("*")
    .eq("user_id", user.id)
    .eq("household_id", ctx.household_id)
    .single();

  if (!state) {
    return NextResponse.json({ error: "Onboarding not started" }, { status: 404 });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // Determine target phase
  let targetPhase: string;

  if (body.target_phase) {
    const check = validateEnum(body.target_phase, "target_phase", VALID_PHASES);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    targetPhase = check.value;
  } else {
    // Auto-advance to next phase
    targetPhase = VALID_TRANSITIONS[state.current_phase];
    if (!targetPhase) {
      return NextResponse.json({
        error: `Cannot advance from ${state.current_phase}`,
      }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const updateFields: Record<string, unknown> = {
    current_phase: targetPhase,
    updated_at: now,
  };

  if (targetPhase === "refinement") {
    updateFields.refinement_completed_at = null;
  }

  if (targetPhase === "active") {
    updateFields.refinement_completed_at = now;
  }

  const { data: updated, error } = await platform(supabase)
    .from("onboarding_state")
    .update(updateFields)
    .eq("id", state.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    state: updated,
    message: `Advanced to ${targetPhase} phase`,
  });
}
