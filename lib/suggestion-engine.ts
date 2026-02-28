// ============================================================
// FILE: lib/suggestion-engine.ts
// PURPOSE: Analyze observations + behavioral data to generate
//          proactive AI suggestions. Called by batch job or agent.
// PART OF: Desperado Club
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { platform } from "@/lib/supabase/schemas";
import { anthropic, getModel } from "@/lib/agent/client";
import type { SuggestionCategory } from "@/lib/types";

interface SuggestionCandidate {
  category: SuggestionCategory;
  title: string;
  description: string;
  reasoning: string;
  priority: number;
  confidence: number;
  source_observation_ids: string[];
}

/**
 * Generate suggestions for a user based on their observations and behavioral data.
 * Uses AI to analyze patterns and produce actionable suggestions.
 */
export async function generateSuggestionsForUser(
  supabase: SupabaseClient,
  userId: string,
  householdId?: string,
): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];

  // Gather context
  const [observations, aggregates, existingSuggestions] = await Promise.all([
    getRecentObservations(supabase, userId),
    getRecentAggregates(supabase, userId),
    getPendingSuggestions(supabase, userId),
  ]);

  if (observations.length === 0 && aggregates.length === 0) {
    return { created: 0, errors: ["Not enough data to generate suggestions"] };
  }

  // Don't generate if user already has many pending suggestions
  if (existingSuggestions.length >= 5) {
    return { created: 0, errors: ["User has 5+ pending suggestions — wait for responses"] };
  }

  // Build prompt for AI
  const observationText = observations
    .map((o) => `[${o.observation_type}|${o.source_layer}|conf:${o.confidence}] ${o.content}`)
    .join("\n");

  const aggregateText = aggregates.length > 0
    ? aggregates.map((a) => `${a.date}: tasks=${a.tasks_created}/${a.tasks_completed}, habits=${a.habits_checked}/${a.habits_missed}, xp=${a.xp_earned}`).join("\n")
    : "No behavioral data yet.";

  const existingText = existingSuggestions.length > 0
    ? existingSuggestions.map((s) => `- [${s.category}] ${s.title}`).join("\n")
    : "None pending.";

  try {
    const response = await anthropic.messages.create({
      model: getModel("smart"),
      max_tokens: 1500,
      system: `You generate proactive suggestions for a household management app user. Based on their observations and behavioral data, suggest 1-3 actionable improvements. Be specific and evidence-based — cite which observations led to each suggestion. Categories: habit_adjustment, goal_suggestion, schedule_optimization, delegation_suggestion, financial_insight, general.

Output JSON array: [{"category":"...","title":"...","description":"...","reasoning":"...","priority":1-10,"confidence":0-1,"source_observation_ids":["observation_id_1"]}]

Rules:
- Only suggest things with clear evidence
- Don't repeat existing pending suggestions
- Priority 8-10 for urgent/high-impact, 4-7 for moderate, 1-3 for nice-to-have
- Keep titles under 60 chars, descriptions under 200 chars`,
      messages: [{
        role: "user",
        content: `User observations:\n${observationText}\n\nBehavioral data (last 7 days):\n${aggregateText}\n\nAlready pending suggestions:\n${existingText}\n\nGenerate 1-3 new suggestions. Return valid JSON array only.`,
      }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Parse suggestions from AI response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { created: 0, errors: ["AI did not return valid JSON"] };
    }

    let candidates: SuggestionCandidate[];
    try {
      candidates = JSON.parse(jsonMatch[0]);
    } catch {
      return { created: 0, errors: ["Failed to parse AI suggestion JSON"] };
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { created: 0, errors: ["No suggestions generated"] };
    }

    // Validate and insert
    const validCategories = [
      "habit_adjustment", "goal_suggestion", "schedule_optimization",
      "delegation_suggestion", "gamification_tweak", "responsibility_rebalance",
      "boundary_suggestion", "reward_suggestion", "notification_optimization",
      "financial_insight", "general",
    ];

    const toInsert = candidates
      .filter((c) => c.title && c.description && validCategories.includes(c.category))
      .slice(0, 3) // Max 3 suggestions per run
      .map((c) => ({
        user_id: userId,
        household_id: householdId || null,
        category: c.category,
        title: c.title.slice(0, 300),
        description: c.description.slice(0, 2000),
        reasoning: c.reasoning?.slice(0, 5000) || null,
        priority: Math.min(Math.max(Math.round(c.priority || 5), 1), 10),
        confidence: Math.min(Math.max(c.confidence || 0.5, 0), 1),
        status: "pending" as const,
        source_observation_ids: Array.isArray(c.source_observation_ids) ? c.source_observation_ids.slice(0, 20) : null,
      }));

    if (toInsert.length === 0) {
      return { created: 0, errors: ["No valid suggestions after filtering"] };
    }

    const { error: insertErr } = await platform(supabase)
      .from("ai_suggestions")
      .insert(toInsert);

    if (insertErr) {
      return { created: 0, errors: [insertErr.message] };
    }

    return { created: toInsert.length, errors };
  } catch (err) {
    return { created: 0, errors: [`AI call failed: ${err}`] };
  }
}

async function getRecentObservations(supabase: SupabaseClient, userId: string) {
  const { data } = await platform(supabase)
    .from("ai_observations")
    .select("id, observation_type, content, confidence, source_layer")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("confidence", { ascending: false })
    .limit(20);
  return data || [];
}

async function getRecentAggregates(supabase: SupabaseClient, userId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const { data } = await platform(supabase)
    .from("behavioral_aggregates")
    .select("date, tasks_created, tasks_completed, habits_checked, habits_missed, xp_earned")
    .eq("user_id", userId)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: false });
  return data || [];
}

async function getPendingSuggestions(supabase: SupabaseClient, userId: string) {
  const { data } = await platform(supabase)
    .from("ai_suggestions")
    .select("id, category, title")
    .eq("user_id", userId)
    .eq("status", "pending");
  return data || [];
}
