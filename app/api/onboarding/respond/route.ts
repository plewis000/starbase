// ============================================================
// FILE: app/api/onboarding/respond/route.ts
// PURPOSE: Submit an answer to an onboarding interview question
//          Stores raw response + extracted structured data
//          Auto-advances to next question
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform, config } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import { validateRequiredString } from "@/lib/validation";
import { generateObservationsFromOnboarding } from "@/lib/observation-generator";

// POST /api/onboarding/respond — submit answer to current question
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

  // Get current onboarding state
  const { data: state } = await platform(supabase)
    .from("onboarding_state")
    .select("*")
    .eq("user_id", user.id)
    .eq("household_id", ctx.household_id)
    .single();

  if (!state) {
    return NextResponse.json({ error: "Onboarding not started" }, { status: 404 });
  }

  if (state.current_phase !== "interview") {
    return NextResponse.json({ error: "Not in interview phase" }, { status: 400 });
  }

  const body = await request.json();

  // Validate response
  const responseCheck = validateRequiredString(body.response, "response", 5000);
  if (!responseCheck.valid) {
    return NextResponse.json({ error: responseCheck.error }, { status: 400 });
  }

  // Get all interview questions
  const { data: questions } = await config(supabase)
    .from("onboarding_questions")
    .select("*")
    .eq("phase", "interview")
    .eq("active", true)
    .order("sort_order");

  if (!questions || state.current_question_index >= questions.length) {
    return NextResponse.json({ error: "No more questions" }, { status: 400 });
  }

  const currentQuestion = questions[state.current_question_index];

  // Store the response
  const { data: savedResponse, error: saveErr } = await platform(supabase)
    .from("onboarding_responses")
    .insert({
      user_id: user.id,
      onboarding_id: state.id,
      question_key: currentQuestion.question_key,
      question_text: currentQuestion.question_text,
      raw_response: responseCheck.value,
      phase: "interview",
      channel: "web",
      extracted_data: body.extracted_data || {},
      confidence: body.confidence || null,
      reviewed_by_user: false,
    })
    .select("*")
    .single();

  if (saveErr) {
    return NextResponse.json({ error: saveErr.message }, { status: 500 });
  }

  // Advance to next question
  const nextIndex = state.current_question_index + 1;
  const isLastQuestion = nextIndex >= questions.length;

  const stateUpdate: Record<string, unknown> = {
    current_question_index: nextIndex,
    updated_at: new Date().toISOString(),
  };

  // If last question, transition to observation phase
  if (isLastQuestion) {
    stateUpdate.current_phase = "observation";
    stateUpdate.interview_completed_at = new Date().toISOString();
    stateUpdate.observation_started_at = new Date().toISOString();
    // Observation period: 7 days
    const observationEnd = new Date();
    observationEnd.setDate(observationEnd.getDate() + 7);
    stateUpdate.observation_ends_at = observationEnd.toISOString();
  }

  await platform(supabase)
    .from("onboarding_state")
    .update(stateUpdate)
    .eq("id", state.id);

  // When interview completes, generate observations from all responses
  let observationResult = null;
  if (isLastQuestion) {
    observationResult = await generateObservationsFromOnboarding(
      supabase,
      user.id,
      ctx.household_id,
      state.id,
    );
  }

  return NextResponse.json({
    response: savedResponse,
    next_question: isLastQuestion ? null : questions[nextIndex],
    interview_complete: isLastQuestion,
    progress: Math.round((nextIndex / questions.length) * 100),
    observations_generated: observationResult?.created || 0,
    message: isLastQuestion
      ? "Interview complete! Entering observation phase — I'll watch and learn for the next 7 days."
      : undefined,
  });
}
