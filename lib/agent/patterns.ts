/**
 * Pattern detection system.
 * Analyzes behavioral aggregates and observations to detect recurring
 * user patterns — temporal habits, avoidance behaviors, preferences.
 *
 * Patterns feed into the suggestion engine and proactive behavior.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { platform } from "@/lib/supabase/schemas";
import { anthropic, getModel } from "./client";

interface DetectedPattern {
  pattern_type: "temporal" | "sequential" | "preference" | "avoidance" | "correlation";
  description: string;
  trigger_conditions: Record<string, unknown>;
  action: string;
  confidence: number;
}

const PATTERN_EXTRACTION_PROMPT = `You are a behavioral pattern detector for a household AI assistant. Given a user's behavioral data and existing observations, identify recurring patterns.

Pattern types:
- temporal: Something that happens at specific times/days ("Checks tasks every Monday morning")
- sequential: Actions that follow each other ("After checking budget, usually reviews transactions")
- preference: Consistent choices ("Always assigns high priority to work tasks")
- avoidance: Things they consistently skip/ignore ("Never checks in habits on weekends")
- correlation: Two things that tend to happen together ("Exercises more on days with fewer tasks")

Rules:
- Only identify patterns with clear evidence (seen 3+ times or very strong signal)
- Be specific about trigger conditions (day_of_week, time_of_day, preceding_action, etc.)
- Confidence: 0.8+ for very clear patterns, 0.5-0.7 for emerging patterns
- Return 0-3 patterns. Empty array is fine — don't force patterns that aren't there.
- The "action" field is what the user typically does when the pattern triggers.

Return ONLY a JSON array. No explanation.`;

/**
 * Detect patterns from behavioral aggregates and observations.
 * Called weekly by the suggestion generation cron or on-demand.
 */
export async function detectPatterns(
  supabase: SupabaseClient,
  userId: string,
  householdId: string | null,
): Promise<{ detected: number; errors: string[] }> {
  const errors: string[] = [];

  // Gather behavioral data (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [aggregates, observations, existingPatterns] = await Promise.all([
    platform(supabase)
      .from("behavioral_aggregates")
      .select("date, tasks_created, tasks_completed, habits_checked, habits_missed, xp_earned, peak_activity_hour, app_sessions")
      .eq("user_id", userId)
      .gte("date", thirtyDaysAgo.toISOString().slice(0, 10))
      .order("date", { ascending: true })
      .then((r) => r.data || []),

    platform(supabase)
      .from("ai_observations")
      .select("observation_type, observation, confidence")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("confidence", { ascending: false })
      .limit(15)
      .then((r) => r.data || []),

    platform(supabase)
      .from("detected_patterns")
      .select("pattern_type, description, action, confidence")
      .eq("user_id", userId)
      .eq("is_active", true)
      .then((r) => r.data || []),
  ]);

  if (aggregates.length < 7) {
    return { detected: 0, errors: ["Not enough behavioral data (need 7+ days)"] };
  }

  // Build context for pattern detection
  const aggText = aggregates.map((a) =>
    `${a.date} (${new Date(a.date).toLocaleDateString("en-US", { weekday: "short" })}): tasks=${a.tasks_created}/${a.tasks_completed}, habits=${a.habits_checked}/${a.habits_missed}, xp=${a.xp_earned}, peak_hour=${a.peak_activity_hour}, sessions=${a.app_sessions}`
  ).join("\n");

  const obsText = observations.map((o) =>
    `[${o.observation_type}] ${o.observation}`
  ).join("\n");

  const existingText = existingPatterns.length > 0
    ? existingPatterns.map((p) => `[${p.pattern_type}] ${p.description} → ${p.action}`).join("\n")
    : "None detected yet.";

  try {
    const response = await anthropic.messages.create({
      model: getModel("fast"),
      max_tokens: 800,
      system: PATTERN_EXTRACTION_PROMPT,
      messages: [{
        role: "user",
        content: `Behavioral data (last 30 days):\n${aggText}\n\nUser observations:\n${obsText || "None yet."}\n\nAlready detected patterns:\n${existingText}\n\nIdentify 0-3 NEW patterns not already detected. Return JSON array.`,
      }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { detected: 0, errors: [] };

    let patterns: DetectedPattern[];
    try {
      patterns = JSON.parse(jsonMatch[0]);
    } catch {
      return { detected: 0, errors: ["Failed to parse pattern JSON"] };
    }

    if (!Array.isArray(patterns) || patterns.length === 0) {
      return { detected: 0, errors: [] };
    }

    const validTypes = ["temporal", "sequential", "preference", "avoidance", "correlation"];
    let detected = 0;

    for (const p of patterns.slice(0, 3)) {
      if (!p.description || !p.action || !validTypes.includes(p.pattern_type)) continue;

      const { error } = await platform(supabase)
        .rpc("upsert_pattern", {
          p_user_id: userId,
          p_household_id: householdId,
          p_pattern_type: p.pattern_type,
          p_description: p.description.slice(0, 500),
          p_trigger_conditions: p.trigger_conditions || {},
          p_action: p.action.slice(0, 500),
          p_confidence: Math.min(Math.max(p.confidence || 0.5, 0.1), 0.99),
        });

      if (error) {
        errors.push(error.message);
      } else {
        detected++;
      }
    }

    return { detected, errors };
  } catch (err) {
    return { detected: 0, errors: [`Pattern detection failed: ${err}`] };
  }
}

/**
 * Get active patterns for a user, for context injection.
 */
export async function getActivePatterns(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: patterns } = await platform(supabase)
    .from("detected_patterns")
    .select("pattern_type, description, action, confidence, times_observed")
    .eq("user_id", userId)
    .eq("is_active", true)
    .gt("confidence", 0.4)
    .order("confidence", { ascending: false })
    .limit(10);

  if (!patterns || patterns.length === 0) return null;

  const lines = patterns.map((p) =>
    `- [${p.pattern_type}] ${p.description} → ${p.action} (seen ${p.times_observed}x, conf: ${p.confidence})`
  );

  return `\nDetected behavioral patterns:\n${lines.join("\n")}`;
}
