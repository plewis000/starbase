/**
 * Graduated proactivity system.
 * Tracks how proactive Zev should be with each user based on interaction
 * history and suggestion acceptance rates.
 *
 * Levels:
 * - observe: Weeks 1-2. Log patterns, never proactively suggest.
 * - tentative: Weeks 3-4. Suggest with low confidence framing ("I noticed...")
 * - confident: Month 2+. Act proactively with opt-out framing.
 * - autonomous: After explicit user approval. Just do it, report results.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { platform } from "@/lib/supabase/schemas";

export type ProactivityLevel = "observe" | "tentative" | "confident" | "autonomous";

interface ProactivityState {
  level: ProactivityLevel;
  interaction_count: number;
  suggestions_accepted: number;
  suggestions_dismissed: number;
}

// Thresholds for auto-graduation
const GRADUATION_RULES: Record<ProactivityLevel, {
  minInteractions: number;
  minAcceptanceRate?: number;
  nextLevel: ProactivityLevel | null;
}> = {
  observe: { minInteractions: 14, nextLevel: "tentative" },
  tentative: { minInteractions: 30, minAcceptanceRate: 0.4, nextLevel: "confident" },
  confident: { minInteractions: 60, minAcceptanceRate: 0.5, nextLevel: null }, // autonomous requires explicit approval
  autonomous: { minInteractions: 0, nextLevel: null },
};

/**
 * Get or create proactivity state for a user.
 */
export async function getProactivityState(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProactivityState> {
  const { data } = await platform(supabase)
    .rpc("ensure_proactivity_state", { p_user_id: userId });

  if (data && data.length > 0) {
    return data[0] as ProactivityState;
  }

  return { level: "observe", interaction_count: 0, suggestions_accepted: 0, suggestions_dismissed: 0 };
}

/**
 * Record an interaction and check for level graduation.
 * Called after each agent conversation.
 */
export async function recordInteraction(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ graduated: boolean; newLevel?: ProactivityLevel }> {
  // Increment interaction count
  const { data: updated } = await platform(supabase)
    .from("proactivity_state")
    .update({
      interaction_count: undefined, // Will use raw SQL below
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  // Use raw increment since Supabase doesn't support increment directly
  await supabase.rpc("ensure_proactivity_state", { p_user_id: userId });
  const { data: state } = await platform(supabase)
    .from("proactivity_state")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!state) return { graduated: false };

  // Increment
  await platform(supabase)
    .from("proactivity_state")
    .update({
      interaction_count: (state.interaction_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  // Check graduation
  const currentLevel = state.level as ProactivityLevel;
  const rules = GRADUATION_RULES[currentLevel];

  if (!rules.nextLevel) return { graduated: false };

  const newCount = (state.interaction_count || 0) + 1;
  if (newCount < rules.minInteractions) return { graduated: false };

  // Check acceptance rate if required
  if (rules.minAcceptanceRate) {
    const total = (state.suggestions_accepted || 0) + (state.suggestions_dismissed || 0);
    if (total < 3) return { graduated: false }; // Not enough data
    const rate = (state.suggestions_accepted || 0) / total;
    if (rate < rules.minAcceptanceRate) return { graduated: false };
  }

  // Graduate!
  await platform(supabase)
    .from("proactivity_state")
    .update({
      level: rules.nextLevel,
      last_graduated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { graduated: true, newLevel: rules.nextLevel };
}

/**
 * Record suggestion feedback for proactivity tracking.
 */
export async function recordSuggestionFeedback(
  supabase: SupabaseClient,
  userId: string,
  accepted: boolean,
): Promise<void> {
  await supabase.rpc("ensure_proactivity_state", { p_user_id: userId });

  const { data: state } = await platform(supabase)
    .from("proactivity_state")
    .select("suggestions_accepted, suggestions_dismissed")
    .eq("user_id", userId)
    .single();

  if (!state) return;

  const updates = accepted
    ? { suggestions_accepted: (state.suggestions_accepted || 0) + 1 }
    : { suggestions_dismissed: (state.suggestions_dismissed || 0) + 1 };

  await platform(supabase)
    .from("proactivity_state")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

/**
 * Get proactivity-appropriate framing for a suggestion.
 */
export function getSuggestionFraming(level: ProactivityLevel): string {
  switch (level) {
    case "observe":
      return ""; // Don't suggest at this level
    case "tentative":
      return "I noticed something that might be useful — feel free to ignore this: ";
    case "confident":
      return "Based on what I've learned about you: ";
    case "autonomous":
      return ""; // Just do it, no framing needed
  }
}

/**
 * Whether we should proactively offer suggestions at this level.
 */
export function shouldSuggest(level: ProactivityLevel, confidence: number): boolean {
  switch (level) {
    case "observe":
      return false; // Never suggest during observation phase
    case "tentative":
      return confidence >= 0.8; // Only high-confidence suggestions
    case "confident":
      return confidence >= 0.5; // Moderate and above
    case "autonomous":
      return confidence >= 0.3; // Almost anything
  }
}
