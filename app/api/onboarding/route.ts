// ============================================================
// FILE: app/api/onboarding/route.ts
// PURPOSE: Onboarding state machine — two tracks:
//          QUICK: 2-3 fields → straight to active (beta users)
//          FULL:  10-question interview → observation → refinement → active
//          Zev defers full interview questions to 1-per-session after quick start
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform, config } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import { validateRequiredString, validateOptionalString } from "@/lib/validation";

// GET /api/onboarding — get current onboarding state + current question
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({
      state: null,
      needs_household: true,
      message: "Create a household first",
    });
  }

  // Fetch onboarding state
  const { data: state } = await platform(supabase)
    .from("onboarding_state")
    .select("*")
    .eq("user_id", user.id)
    .eq("household_id", ctx.household_id)
    .single();

  if (!state) {
    return NextResponse.json({
      state: null,
      phase: "not_started",
      message: "Onboarding not started. POST to begin.",
    });
  }

  // If in interview phase, fetch the current question
  let currentQuestion = null;
  if (state.current_phase === "interview") {
    const { data: questions } = await config(supabase)
      .from("onboarding_questions")
      .select("*")
      .eq("phase", "interview")
      .eq("active", true)
      .order("sort_order");

    if (questions && questions.length > state.current_question_index) {
      currentQuestion = questions[state.current_question_index];
    }

    // Fetch previous responses
    const { data: responses } = await platform(supabase)
      .from("onboarding_responses")
      .select("question_key, raw_response, extracted_data, reviewed_by_user")
      .eq("onboarding_id", state.id)
      .order("created_at");

    return NextResponse.json({
      state,
      phase: state.current_phase,
      track: state.track || "full",
      current_question: currentQuestion,
      total_questions: questions?.length || 0,
      responses: responses || [],
      progress: questions?.length
        ? Math.round((state.current_question_index / questions.length) * 100)
        : 0,
    });
  }

  // For quick-start users in active phase, check if there are unanswered deferred questions
  if (state.track === "quick" && state.current_phase === "active") {
    const { data: responses } = await platform(supabase)
      .from("onboarding_responses")
      .select("question_key")
      .eq("onboarding_id", state.id);

    const answeredKeys = new Set((responses || []).map((r) => r.question_key));

    const { data: allQuestions } = await config(supabase)
      .from("onboarding_questions")
      .select("*")
      .eq("phase", "interview")
      .eq("active", true)
      .order("sort_order");

    const unanswered = (allQuestions || []).filter((q) => !answeredKeys.has(q.question_key));

    return NextResponse.json({
      state,
      phase: state.current_phase,
      track: state.track,
      // Zev can ask one of these per session
      deferred_question: unanswered.length > 0 ? unanswered[0] : null,
      deferred_remaining: unanswered.length,
    });
  }

  return NextResponse.json({
    state,
    phase: state.current_phase,
    track: state.track || "full",
  });
}

// POST /api/onboarding — start the onboarding process
// Body: { track: "quick" | "full", display_name?: string, boundaries?: string }
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({ error: "No household found. Create one first." }, { status: 404 });
  }

  // Check if already started
  const { data: existing } = await platform(supabase)
    .from("onboarding_state")
    .select("id, current_phase, track")
    .eq("user_id", user.id)
    .eq("household_id", ctx.household_id)
    .single();

  if (existing) {
    return NextResponse.json({
      error: "Onboarding already started",
      state: existing,
    }, { status: 409 });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const track = body.track === "quick" ? "quick" : "full";

  if (track === "quick") {
    // ---- QUICK START ----
    // Minimal setup: display name + optional boundaries → straight to active

    const displayNameCheck = validateOptionalString(body.display_name, "display_name", 50);
    if (!displayNameCheck.valid) {
      return NextResponse.json({ error: displayNameCheck.error }, { status: 400 });
    }

    // Update household member display name if provided
    if (displayNameCheck.value) {
      await platform(supabase)
        .from("household_members")
        .update({ display_name: displayNameCheck.value })
        .eq("user_id", user.id)
        .eq("household_id", ctx.household_id);
    }

    // Create onboarding state — skip straight to active
    const { data: state, error } = await platform(supabase)
      .from("onboarding_state")
      .insert({
        user_id: user.id,
        household_id: ctx.household_id,
        current_phase: "active",
        current_question_index: 0,
        track: "quick",
        interview_completed_at: null, // Not completed — deferred
        metadata: { quick_start: true, ...body.metadata },
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If boundaries were provided, store them
    if (body.boundaries && typeof body.boundaries === "string" && body.boundaries.trim()) {
      const boundaryCheck = validateRequiredString(body.boundaries, "boundaries", 2000);
      if (boundaryCheck.valid) {
        await platform(supabase)
          .from("user_boundaries")
          .insert({
            user_id: user.id,
            category: "general",
            boundary_key: "initial_boundaries",
            boundary_value: { text: boundaryCheck.value },
            reason: "Set during quick-start onboarding",
            source: "onboarding",
          });
      }
    }

    return NextResponse.json({
      state,
      track: "quick",
      message: "You're in! Zev will get to know you gradually over the next few sessions.",
    }, { status: 201 });
  }

  // ---- FULL INTERVIEW ----
  const { data: state, error } = await platform(supabase)
    .from("onboarding_state")
    .insert({
      user_id: user.id,
      household_id: ctx.household_id,
      current_phase: "interview",
      current_question_index: 0,
      track: "full",
      metadata: body.metadata || {},
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch first question
  const { data: questions } = await config(supabase)
    .from("onboarding_questions")
    .select("*")
    .eq("phase", "interview")
    .eq("active", true)
    .order("sort_order")
    .limit(1);

  return NextResponse.json({
    state,
    track: "full",
    current_question: questions?.[0] || null,
    total_questions: 10,
    message: "Onboarding started. Let's get to know you.",
  }, { status: 201 });
}
