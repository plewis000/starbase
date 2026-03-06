/**
 * Communication style tracking.
 * Analyzes conversation patterns to build a per-user style profile.
 * Tracks: verbosity preference, formality, proactivity tolerance, detail level.
 *
 * Stored as user_model attributes, injected into system prompt.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { platform } from "@/lib/supabase/schemas";

export interface StyleProfile {
  verbosity: number;      // 0 = terse, 1 = verbose
  formality: number;      // 0 = casual, 1 = formal
  detail_preference: number; // 0 = just answer, 1 = explain everything
  emoji_tolerance: number;   // 0 = no emoji, 1 = lots of emoji
}

const DEFAULT_STYLE: StyleProfile = {
  verbosity: 0.5,
  formality: 0.3,
  detail_preference: 0.5,
  emoji_tolerance: 0.2,
};

/**
 * Analyze a conversation exchange to extract style signals.
 * Returns adjustments to the style profile (deltas).
 */
export function analyzeStyleSignals(
  userMessage: string,
  assistantResponse: string,
): Partial<StyleProfile> | null {
  const signals: Partial<StyleProfile> = {};
  let hasSignals = false;

  const msgLen = userMessage.length;
  const msgWords = userMessage.split(/\s+/).length;

  // Verbosity signals from user message length
  if (msgWords <= 5) {
    signals.verbosity = -0.02; // User is terse → they probably want terse back
    hasSignals = true;
  } else if (msgWords >= 50) {
    signals.verbosity = 0.02; // User writes a lot → they appreciate detail
    hasSignals = true;
  }

  // Formality signals
  const informalMarkers = /\b(lol|lmao|haha|gonna|wanna|ya|nah|bruh|dude|omg)\b/i;
  const formalMarkers = /\b(please|kindly|would you|could you|appreciate|regarding)\b/i;

  if (informalMarkers.test(userMessage)) {
    signals.formality = -0.03;
    hasSignals = true;
  } else if (formalMarkers.test(userMessage)) {
    signals.formality = 0.02;
    hasSignals = true;
  }

  // Detail preference signals
  const wantsMore = /\b(explain|why|how does|tell me more|details|elaborate|what do you mean)\b/i;
  const wantsLess = /\b(just|only|tldr|short|quick|briefly|skip)\b/i;

  if (wantsMore.test(userMessage)) {
    signals.detail_preference = 0.05;
    hasSignals = true;
  } else if (wantsLess.test(userMessage)) {
    signals.detail_preference = -0.05;
    hasSignals = true;
  }

  // Emoji signals
  const userEmojis = (userMessage.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
  if (userEmojis >= 2) {
    signals.emoji_tolerance = 0.03;
    hasSignals = true;
  } else if (msgLen > 30 && userEmojis === 0) {
    signals.emoji_tolerance = -0.01;
    hasSignals = true;
  }

  return hasSignals ? signals : null;
}

/**
 * Get the current style profile for a user from user_model.
 */
export async function getStyleProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<StyleProfile> {
  const { data } = await platform(supabase)
    .from("user_model")
    .select("value")
    .eq("user_id", userId)
    .eq("attribute", "communication_style")
    .eq("is_current", true)
    .single();

  if (data?.value) {
    return { ...DEFAULT_STYLE, ...(data.value as Partial<StyleProfile>) };
  }

  return { ...DEFAULT_STYLE };
}

/**
 * Update the style profile with new signals.
 * Applies deltas with clamping to [0, 1].
 */
export async function updateStyleProfile(
  supabase: SupabaseClient,
  userId: string,
  deltas: Partial<StyleProfile>,
): Promise<void> {
  const current = await getStyleProfile(supabase, userId);

  const updated: StyleProfile = {
    verbosity: clamp(current.verbosity + (deltas.verbosity || 0)),
    formality: clamp(current.formality + (deltas.formality || 0)),
    detail_preference: clamp(current.detail_preference + (deltas.detail_preference || 0)),
    emoji_tolerance: clamp(current.emoji_tolerance + (deltas.emoji_tolerance || 0)),
  };

  // Check if anything actually changed significantly
  const totalDelta = Math.abs((deltas.verbosity || 0)) +
    Math.abs((deltas.formality || 0)) +
    Math.abs((deltas.detail_preference || 0)) +
    Math.abs((deltas.emoji_tolerance || 0));

  if (totalDelta < 0.01) return; // No meaningful change

  // Upsert into user_model
  const { data: existing } = await platform(supabase)
    .from("user_model")
    .select("id, version")
    .eq("user_id", userId)
    .eq("attribute", "communication_style")
    .eq("is_current", true)
    .single();

  if (existing) {
    // Mark old as not current and insert new version
    await platform(supabase)
      .from("user_model")
      .update({ is_current: false })
      .eq("id", existing.id);

    await platform(supabase)
      .from("user_model")
      .insert({
        user_id: userId,
        attribute: "communication_style",
        category: "personality",
        value: updated,
        layer: "observed",
        confidence: 0.7,
        version: (existing.version || 0) + 1,
        previous_version_id: existing.id,
        is_current: true,
      });
  } else {
    await platform(supabase)
      .from("user_model")
      .insert({
        user_id: userId,
        attribute: "communication_style",
        category: "personality",
        value: updated,
        layer: "observed",
        confidence: 0.5,
        version: 1,
        is_current: true,
      });
  }
}

/**
 * Build style guidance text for injection into system prompt.
 */
export function buildStyleGuidance(style: StyleProfile): string {
  const parts: string[] = [];

  if (style.verbosity < 0.3) parts.push("Keep responses very short and direct.");
  else if (style.verbosity > 0.7) parts.push("This user appreciates detailed, thorough responses.");

  if (style.formality < 0.3) parts.push("Use casual, conversational tone.");
  else if (style.formality > 0.7) parts.push("Use a more professional, polished tone.");

  if (style.detail_preference < 0.3) parts.push("Skip explanations — just give the answer or result.");
  else if (style.detail_preference > 0.7) parts.push("Include reasoning and context with your answers.");

  if (style.emoji_tolerance < 0.2) parts.push("Avoid emoji.");
  else if (style.emoji_tolerance > 0.6) parts.push("Emoji are welcome in responses.");

  if (parts.length === 0) return "";
  return `\nCommunication style preferences:\n${parts.join("\n")}`;
}

function clamp(val: number, min = 0, max = 1): number {
  return Math.min(Math.max(val, min), max);
}
