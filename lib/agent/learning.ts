/**
 * Post-conversation learning extraction.
 * After each agent response, analyze the conversation for new observations
 * about the user — preferences, patterns, facts, corrections.
 * Uses Haiku for cheap, fast extraction. Runs async (fire-and-forget via after()).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, getModel } from "./client";
import { platform } from "@/lib/supabase/schemas";
import { analyzeStyleSignals, updateStyleProfile, getStyleProfile, buildStyleGuidance } from "./style-tracker";
import { getActivePatterns } from "./patterns";
import { getProactivityState, recordInteraction, getSuggestionFraming } from "./proactivity";

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

  // Track communication style signals (non-blocking)
  const styleSignals = analyzeStyleSignals(userMessage, assistantResponse);
  if (styleSignals) {
    updateStyleProfile(supabase, userId, styleSignals).catch(() => {});
  }

  // Record interaction for proactivity graduation (non-blocking)
  recordInteraction(supabase, userId).catch(() => {});

  // Load existing observations to avoid duplicates and enable superseding
  const { data: existing } = await platform(supabase)
    .from("ai_observations")
    .select("id, observation, observation_type")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(50);

  const existingContents = new Set(
    (existing || []).map((o) => o.observation.toLowerCase().trim())
  );
  const existingByType = new Map<string, { id: string; content: string }[]>();
  for (const o of existing || []) {
    if (!existingByType.has(o.observation_type)) existingByType.set(o.observation_type, []);
    existingByType.get(o.observation_type)!.push({ id: o.id, content: o.observation.toLowerCase().trim() });
  }

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
        // Deduplicate: skip if substantially similar observation exists
        const normalizedContent = o.content.toLowerCase().trim();
        if (existingContents.has(normalizedContent)) return false;
        // Check for fuzzy duplicates — prefix match OR keyword overlap
        const prefix = normalizedContent.slice(0, 40);
        const words = new Set(normalizedContent.split(/\s+/).filter((w) => w.length > 3));
        for (const existing of existingContents) {
          if (existing.startsWith(prefix)) return false;
          // Check keyword overlap — if >60% of significant words match, it's a duplicate
          if (words.size > 0) {
            const existingWords = existing.split(/\s+/).filter((w: string) => w.length > 3);
            const overlap = existingWords.filter((w: string) => words.has(w)).length;
            if (overlap > 0 && overlap / Math.max(words.size, existingWords.length) > 0.6) return false;
          }
        }
        return true;
      })
      .slice(0, 3) // Max 3 observations per exchange
      .map((o) => ({
        user_id: userId,
        household_id: householdId,
        observation_type: o.observation_type,
        observation: o.content.slice(0, 1000),
        confidence: Math.min(Math.max(o.confidence || 0.7, 0.1), 1.0),
        source_layer: o.source_layer || "observed",
        data: { conversation_id: conversationId, auto_extracted: true },
        tags: Array.isArray(o.tags) ? o.tags.slice(0, 10) : [],
        is_active: true,
      }));

    if (toInsert.length === 0) {
      return { extracted: 0, errors: [] };
    }

    // For corrections, supersede conflicting observations of the same type
    for (const obs of toInsert) {
      if (obs.observation_type === "correction") {
        const sameType = existingByType.get("correction") || [];
        const obsWords = new Set(obs.observation.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
        for (const existing of sameType) {
          const existWords = existing.content.split(/\s+/).filter((w: string) => w.length > 3);
          const overlap = existWords.filter((w: string) => obsWords.has(w)).length;
          if (overlap > 0 && overlap / Math.max(obsWords.size, existWords.length) > 0.4) {
            // Supersede the old observation
            await platform(supabase)
              .from("ai_observations")
              .update({ is_active: false })
              .eq("id", existing.id);
          }
        }
      }
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
    .select("full_name")
    .eq("id", userId)
    .single();

  const userName = userRecord?.full_name || "User";

  // Get observations grouped by type, ordered by confidence
  const { data: observations } = await platform(supabase)
    .from("ai_observations")
    .select("id, observation_type, observation, confidence, source_layer")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("confidence", { ascending: false })
    .limit(30);

  // Also load household-level observations from OTHER members
  // This gives Zev cross-user knowledge (e.g., "Lenale handles grocery shopping")
  const { getHouseholdContext, getHouseholdMemberIds } = await import("@/lib/household");
  const ctx = await getHouseholdContext(supabase, userId);
  let householdObs: { observation_type: string; observation: string; confidence: number }[] = [];
  let partnerName = "";
  if (ctx) {
    const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
    const otherMemberIds = memberIds.filter(id => id !== userId);
    if (otherMemberIds.length > 0) {
      // Get partner's name
      const { data: partners } = await platform(supabase)
        .from("users")
        .select("full_name")
        .in("id", otherMemberIds)
        .limit(1);
      if (partners?.[0]) {
        partnerName = partners[0].full_name || "";
      }

      // Get household-relevant observations from partner
      // Only types that benefit cross-user: relationship, routine, preference, context
      const { data: partnerObs } = await platform(supabase)
        .from("ai_observations")
        .select("observation_type, observation, confidence")
        .in("user_id", otherMemberIds)
        .eq("is_active", true)
        .in("observation_type", ["relationship", "routine", "context", "preference"])
        .gte("confidence", 0.7)
        .order("confidence", { ascending: false })
        .limit(10);
      householdObs = partnerObs || [];
    }
  }

  if ((!observations || observations.length === 0) && householdObs.length === 0) {
    return `You are talking to ${userName}. You don't know much about them yet — learn through conversation. Ask questions naturally, remember what they tell you.`;
  }

  // Memory access refresh — boost confidence of accessed observations (Ebbinghaus-inspired).
  // Observations that are used in conversations are still relevant; prevent decay.
  // Non-blocking: fire and forget.
  const boostIds = (observations || [])
    .filter((o) => o.confidence < 0.95 && o.source_layer !== "declared")
    .map((o) => o.id);
  if (boostIds.length > 0) {
    // Tiny boost (+0.02) per access, capped at 0.95
    Promise.resolve(
      platform(supabase)
        .rpc("boost_observation_confidence", { p_ids: boostIds, p_amount: 0.02, p_cap: 0.95 })
    ).catch(() => {}); // Non-critical — silently ignore errors
  }

  // Group by type
  const grouped: Record<string, string[]> = {};
  for (const obs of observations || []) {
    const type = obs.observation_type;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(`${obs.observation} [${obs.source_layer}, conf:${obs.confidence}]`);
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

  // Inject household context from partner
  if (householdObs.length > 0 && partnerName) {
    sections.push(`\nAbout ${partnerName} (household partner — knowledge from their conversations):`);
    for (const obs of householdObs.slice(0, 6)) {
      sections.push(`- ${obs.observation}`);
    }
  }

  // Inject communication style guidance
  const styleProfile = await getStyleProfile(supabase, userId);
  const styleGuidance = buildStyleGuidance(styleProfile);
  if (styleGuidance) {
    sections.push(styleGuidance);
  }

  // Inject detected behavioral patterns
  const patternContext = await getActivePatterns(supabase, userId);
  if (patternContext) {
    sections.push(patternContext);
  }

  // Inject proactivity level
  const proactivity = await getProactivityState(supabase, userId);
  if (proactivity.level !== "observe") {
    const framing = getSuggestionFraming(proactivity.level);
    sections.push(`\nProactivity level: ${proactivity.level}. ${framing ? `When suggesting, use framing like: "${framing}"` : "You can act autonomously and report results."}`);
  } else {
    sections.push("\nProactivity level: observe. Do NOT proactively suggest things yet — focus on learning about this user.");
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

  // Inject situation awareness — pending suggestions to weave in naturally
  if (proactivity.level !== "observe") {
    const { data: pendingSuggestions } = await platform(supabase)
      .from("ai_suggestions")
      .select("title, category, body")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("priority", { ascending: false })
      .limit(2);

    if (pendingSuggestions && pendingSuggestions.length > 0) {
      sections.push("\nPending suggestions you can weave in when naturally relevant (don't force them):");
      for (const s of pendingSuggestions) {
        sections.push(`- [${s.category}] ${s.title}: ${(s.body || "").slice(0, 100)}`);
      }
    }
  }

  // Quick workload snapshot for EA awareness
  if (ctx) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const { count: overdueCount } = await platform(supabase)
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .contains("owner_ids", [userId])
      .lt("due_date", todayStr)
      .is("completed_at", null);

    const overdue = overdueCount || 0;
    if (overdue > 0) {
      sections.push(`\nSituation: ${userName} has ${overdue} overdue task${overdue > 1 ? "s" : ""}. Address if relevant.`);
    }
  }

  return sections.join("\n");
}
