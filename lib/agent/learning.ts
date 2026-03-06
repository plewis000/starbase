/**
 * Post-conversation learning extraction.
 * After each agent response, analyze the conversation for new observations
 * about the user — preferences, patterns, facts, corrections.
 * Uses Haiku for cheap, fast extraction. Runs async (fire-and-forget via after()).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, getModel } from "./client";
import { platform } from "@/lib/supabase/schemas";

interface ExtractedObservation {
  observation_type: string;
  content: string;
  confidence: number;
  source_layer: "declared" | "observed" | "inferred";
  tags: string[];
}

const EXTRACTION_PROMPT = `You are an observation extractor for a household AI assistant. Given a conversation exchange, extract facts worth remembering about the user for future conversations.

EXTRACT these types:
- preference: Things they like/dislike, how they want things done
- routine: Daily/weekly patterns, schedules, habits
- personality: Communication style, humor, values, motivation style
- relationship: Family dynamics, who does what, interpersonal context
- goal: What they're working toward, aspirations
- boundary: Things that annoy them, limits, sensitivities
- context: Life circumstances, job, location, important dates
- feedback_pattern: How they respond to suggestions, what they accept/reject
- correction: When they correct the assistant — this is HIGH priority

RULES:
- Only extract genuinely useful, specific facts. "User asked about tasks" is NOT useful.
- DO extract: "User prefers morning task reviews", "User gets frustrated when asked too many questions", "Lenale handles grocery shopping"
- DO NOT extract: vague observations, tool call descriptions, or things already obvious
- Set confidence: 0.9 for explicit statements, 0.7 for clear implications, 0.5 for weak signals
- source_layer: "declared" if user explicitly said it, "observed" if from behavior, "inferred" if you're reading between lines
- Return empty array [] if nothing worth remembering. Most exchanges have nothing new.
- Keep content concise — one sentence per observation.
- Tag with relevant domains: finance, tasks, habits, goals, shopping, household, schedule, communication

Return ONLY a JSON array. No explanation.`;

/**
 * Extract observations from a conversation exchange.
 * Called after each agent response via after().
 */
export async function extractLearnings(
  supabase: SupabaseClient,
  userId: string,
  householdId: string | null,
  userMessage: string,
  assistantResponse: string,
  conversationId: string,
): Promise<{ extracted: number; errors: string[] }> {
  const errors: string[] = [];

  // Skip very short exchanges — nothing to learn
  if (userMessage.length < 10 && assistantResponse.length < 20) {
    return { extracted: 0, errors: [] };
  }

  // Load existing observations to avoid duplicates
  const { data: existing } = await platform(supabase)
    .from("ai_observations")
    .select("content")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(50);

  const existingContents = new Set(
    (existing || []).map((o) => o.content.toLowerCase().trim())
  );

  try {
    const response = await anthropic.messages.create({
      model: getModel("fast"),
      max_tokens: 800,
      system: EXTRACTION_PROMPT,
      messages: [{
        role: "user",
        content: `User message: "${userMessage}"\n\nAssistant response: "${assistantResponse.slice(0, 1000)}"`,
      }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { extracted: 0, errors: [] };

    let observations: ExtractedObservation[];
    try {
      observations = JSON.parse(jsonMatch[0]);
    } catch {
      return { extracted: 0, errors: ["Failed to parse extraction JSON"] };
    }

    if (!Array.isArray(observations) || observations.length === 0) {
      return { extracted: 0, errors: [] };
    }

    // Filter valid types and deduplicate against existing
    const validTypes = [
      "preference", "routine", "personality", "relationship",
      "goal", "boundary", "context", "feedback_pattern", "correction",
    ];

    const toInsert = observations
      .filter((o) => {
        if (!o.content || !validTypes.includes(o.observation_type)) return false;
        // Deduplicate: skip if substantially similar content exists
        const normalizedContent = o.content.toLowerCase().trim();
        if (existingContents.has(normalizedContent)) return false;
        // Check for fuzzy duplicates (first 40 chars match)
        const prefix = normalizedContent.slice(0, 40);
        for (const existing of existingContents) {
          if (existing.startsWith(prefix)) return false;
        }
        return true;
      })
      .slice(0, 3) // Max 3 observations per exchange
      .map((o) => ({
        user_id: userId,
        household_id: householdId,
        observation_type: o.observation_type,
        content: o.content.slice(0, 1000),
        confidence: Math.min(Math.max(o.confidence || 0.7, 0.1), 1.0),
        source_layer: o.source_layer || "observed",
        source_data: { conversation_id: conversationId, auto_extracted: true },
        tags: Array.isArray(o.tags) ? o.tags.slice(0, 10) : [],
        is_active: true,
      }));

    if (toInsert.length === 0) {
      return { extracted: 0, errors: [] };
    }

    const { error: insertErr } = await platform(supabase)
      .from("ai_observations")
      .insert(toInsert);

    if (insertErr) {
      errors.push(insertErr.message);
      return { extracted: 0, errors };
    }

    return { extracted: toInsert.length, errors };
  } catch (err) {
    return { extracted: 0, errors: [`Learning extraction failed: ${err}`] };
  }
}

/**
 * Build rich per-user context from observations and user model.
 * Returns a structured context block to inject into the system prompt.
 */
export async function buildUserContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  // Get user's display name
  const { data: userRecord } = await platform(supabase)
    .from("users")
    .select("display_name, full_name")
    .eq("id", userId)
    .single();

  const userName = userRecord?.display_name || userRecord?.full_name || "User";

  // Get observations grouped by type, ordered by confidence
  const { data: observations } = await platform(supabase)
    .from("ai_observations")
    .select("observation_type, content, confidence, source_layer")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("confidence", { ascending: false })
    .limit(30);

  if (!observations || observations.length === 0) {
    return `You are talking to ${userName}. You don't know much about them yet — learn through conversation.`;
  }

  // Group by type
  const grouped: Record<string, string[]> = {};
  for (const obs of observations) {
    const type = obs.observation_type;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(`${obs.content} [${obs.source_layer}, conf:${obs.confidence}]`);
  }

  // Build structured context
  const sections: string[] = [`You are talking to ${userName}. Here is what you know about them:`];

  const typeLabels: Record<string, string> = {
    preference: "Preferences",
    routine: "Routines & Schedule",
    personality: "Personality & Communication",
    relationship: "Relationships & Household",
    goal: "Goals & Aspirations",
    boundary: "Boundaries & Sensitivities",
    context: "Life Context",
    feedback_pattern: "How They Respond to You",
    correction: "Corrections (HIGH PRIORITY — do not repeat these mistakes)",
  };

  // Corrections first — most important
  if (grouped.correction) {
    sections.push(`\n${typeLabels.correction}:`);
    for (const c of grouped.correction) sections.push(`- ${c}`);
  }

  // Then preferences and personality
  for (const type of ["preference", "personality", "boundary", "routine", "relationship", "goal", "context", "feedback_pattern"]) {
    if (grouped[type]) {
      sections.push(`\n${typeLabels[type] || type}:`);
      for (const item of grouped[type].slice(0, 5)) {
        sections.push(`- ${item}`);
      }
    }
  }

  // Get recent suggestion feedback to understand what they accept/reject
  const { data: recentSuggestions } = await platform(supabase)
    .from("ai_suggestions")
    .select("category, title, status")
    .eq("user_id", userId)
    .in("status", ["accepted", "dismissed"])
    .order("updated_at", { ascending: false })
    .limit(5);

  if (recentSuggestions && recentSuggestions.length > 0) {
    sections.push("\nRecent suggestion responses:");
    for (const s of recentSuggestions) {
      sections.push(`- ${s.status === "accepted" ? "Accepted" : "Dismissed"}: ${s.title}`);
    }
  }

  return sections.join("\n");
}
