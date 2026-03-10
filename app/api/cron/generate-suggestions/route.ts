import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";
import { generateSuggestionsForUser } from "@/lib/suggestion-engine";
import { detectPatterns } from "@/lib/agent/patterns";
import { triggerNotification } from "@/lib/notify";
import { getProactivityState, shouldSuggest } from "@/lib/agent/proactivity";

/**
 * CRON: Generate proactive AI suggestions for all active users.
 * Runs weekly on Sundays at 4 AM UTC (11 PM CT Saturday).
 * Analyzes observations + behavioral data to suggest improvements.
 * Now also DELIVERS suggestions via notification channels.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get all active users with their household
  const { data: users, error: usersErr } = await platform(supabase)
    .from("users")
    .select("id, full_name, household_members!inner(household_id)");

  if (usersErr || !users) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  let totalCreated = 0;
  let totalPatterns = 0;
  let totalDelivered = 0;
  const results: { user_id: string; created: number; patterns: number; delivered: number; errors: string[] }[] = [];

  for (const user of users) {
    const householdId = (user as unknown as { household_members: { household_id: string }[] })
      .household_members?.[0]?.household_id;

    // Detect patterns first — they feed into suggestion generation
    const patternResult = await detectPatterns(supabase, user.id, householdId || null);
    totalPatterns += patternResult.detected;

    const result = await generateSuggestionsForUser(supabase, user.id, householdId);
    totalCreated += result.created;

    // Deliver new suggestions to users (based on proactivity level)
    let delivered = 0;
    if (result.created > 0) {
      const proactivity = await getProactivityState(supabase, user.id);
      if (proactivity.level !== "observe") {
        // Get the suggestions we just created
        const { data: newSuggestions } = await platform(supabase)
          .from("ai_suggestions")
          .select("title, body, category, confidence")
          .eq("user_id", user.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(result.created);

        for (const sug of newSuggestions || []) {
          if (shouldSuggest(proactivity.level, sug.confidence || 0.5)) {
            triggerNotification(supabase, {
              recipientUserId: user.id,
              title: `Suggestion: ${sug.title}`,
              body: sug.body?.slice(0, 300) || sug.title,
              event: "system",
              metadata: { category: sug.category, type: "ai_suggestion" },
            }).catch((err) => console.error("[generate-suggestions] notification failed:", err));
            delivered++;
          }
        }
        totalDelivered += delivered;
      }
    }

    results.push({
      user_id: user.id,
      created: result.created,
      patterns: patternResult.detected,
      delivered,
      errors: [...result.errors, ...patternResult.errors],
    });
  }

  return NextResponse.json({
    total_created: totalCreated,
    total_patterns: totalPatterns,
    total_delivered: totalDelivered,
    total_users: users.length,
    results,
  });
}
