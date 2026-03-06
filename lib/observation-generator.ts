// ============================================================
// FILE: lib/observation-generator.ts
// PURPOSE: Convert onboarding interview responses into AI observations
//          Each question maps to one or more typed observations
//          that the agent can query during conversations
// PART OF: The Keep
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { platform } from "@/lib/supabase/schemas";
import type { AiSourceLayer } from "@/lib/types";

interface ObservationPartial {
  observation_type: string;
  observation: string;
  confidence: number;
  source_layer: AiSourceLayer;
  data?: Record<string, unknown>;
  tags?: string[];
}

interface ObservationInput extends ObservationPartial {
  user_id: string;
  household_id?: string;
}

// Maps question_key to observation extraction logic
const QUESTION_EXTRACTORS: Record<string, (raw: string, extracted?: Record<string, unknown>) => ObservationPartial[]> = {
  // Core identity
  household_roles: (raw, extracted) => [{
    observation_type: "relationship",
    observation: `Household roles and dynamics: ${raw}`,
    confidence: 0.9,
    source_layer: "declared",
    tags: ["household", "roles", "onboarding"],
    data: { question: "household_roles", extracted },
  }],

  daily_routine: (raw, extracted) => [{
    observation_type: "routine",
    observation: `Daily routine: ${raw}`,
    confidence: 0.9,
    source_layer: "declared",
    tags: ["routine", "schedule", "onboarding"],
    data: { question: "daily_routine", extracted },
  }],

  communication_style: (raw, extracted) => [{
    observation_type: "preference",
    observation: `Communication preferences: ${raw}`,
    confidence: 0.9,
    source_layer: "declared",
    tags: ["communication", "preference", "onboarding"],
    data: { question: "communication_style", extracted },
  }],

  biggest_challenge: (raw, extracted) => [{
    observation_type: "context",
    observation: `Biggest current challenge: ${raw}`,
    confidence: 0.85,
    source_layer: "declared",
    tags: ["challenge", "pain-point", "onboarding"],
    data: { question: "biggest_challenge", extracted },
  }],

  goals_priorities: (raw, extracted) => [{
    observation_type: "goal",
    observation: `Goals and priorities: ${raw}`,
    confidence: 0.9,
    source_layer: "declared",
    tags: ["goals", "priorities", "onboarding"],
    data: { question: "goals_priorities", extracted },
  }],

  financial_comfort: (raw, extracted) => [
    {
      observation_type: "preference",
      observation: `Financial tracking comfort level: ${raw}`,
      confidence: 0.85,
      source_layer: "declared",
      tags: ["finance", "comfort", "onboarding"],
      data: { question: "financial_comfort", extracted },
    },
    {
      observation_type: "boundary",
      observation: `Financial sensitivity — be mindful of comfort level when discussing money: ${raw}`,
      confidence: 0.7,
      source_layer: "inferred",
      tags: ["finance", "boundary", "onboarding"],
      data: { question: "financial_comfort", inferred: true },
    },
  ],

  pet_peeves: (raw, extracted) => [{
    observation_type: "boundary",
    observation: `Things that annoy or frustrate them: ${raw}`,
    confidence: 0.9,
    source_layer: "declared",
    tags: ["boundary", "preference", "onboarding"],
    data: { question: "pet_peeves", extracted },
  }],

  motivation_style: (raw, extracted) => [{
    observation_type: "personality",
    observation: `What motivates them: ${raw}`,
    confidence: 0.85,
    source_layer: "declared",
    tags: ["motivation", "personality", "onboarding"],
    data: { question: "motivation_style", extracted },
  }],

  notification_preferences: (raw, extracted) => [{
    observation_type: "preference",
    observation: `Notification preferences: ${raw}`,
    confidence: 0.9,
    source_layer: "declared",
    tags: ["notifications", "preference", "onboarding"],
    data: { question: "notification_preferences", extracted },
  }],

  household_division: (raw, extracted) => [{
    observation_type: "relationship",
    observation: `How household work is divided: ${raw}`,
    confidence: 0.85,
    source_layer: "declared",
    tags: ["household", "division", "responsibilities", "onboarding"],
    data: { question: "household_division", extracted },
  }],
};

/**
 * Generate observations from all completed onboarding responses.
 * Called after the interview phase completes.
 */
export async function generateObservationsFromOnboarding(
  supabase: SupabaseClient,
  userId: string,
  householdId: string,
  onboardingId: string,
): Promise<{ created: number; errors: string[] }> {
  // Fetch all responses for this onboarding
  const { data: responses, error: fetchErr } = await platform(supabase)
    .from("onboarding_responses")
    .select("question_key, raw_response, extracted_data, confidence")
    .eq("onboarding_id", onboardingId)
    .order("created_at", { ascending: true });

  if (fetchErr || !responses) {
    return { created: 0, errors: [fetchErr?.message || "No responses found"] };
  }

  const observations: ObservationInput[] = [];
  const errors: string[] = [];

  for (const response of responses) {
    const extractor = QUESTION_EXTRACTORS[response.question_key];

    if (extractor) {
      try {
        const obs = extractor(response.raw_response, response.extracted_data || undefined);
        observations.push(...obs.map(o => ({
          ...o,
          user_id: userId,
          household_id: householdId,
        })));
      } catch (err) {
        errors.push(`Failed to extract from ${response.question_key}: ${err}`);
      }
    } else {
      // Generic fallback for unknown question keys
      observations.push({
        user_id: userId,
        household_id: householdId,
        observation_type: "context",
        observation: `Onboarding answer (${response.question_key}): ${response.raw_response}`,
        confidence: 0.7,
        source_layer: "declared",
        tags: ["onboarding", response.question_key],
        data: { question: response.question_key },
      });
    }
  }

  if (observations.length === 0) {
    return { created: 0, errors: ["No observations generated from responses"] };
  }

  // Batch insert all observations
  const { error: insertErr } = await platform(supabase)
    .from("ai_observations")
    .insert(observations);

  if (insertErr) {
    return { created: 0, errors: [insertErr.message] };
  }

  return { created: observations.length, errors };
}
