import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";
import { generateSuggestionsForUser } from "@/lib/suggestion-engine";
import { detectPatterns } from "@/lib/agent/patterns";

/**
 * CRON: Generate proactive AI suggestions for all active users.
 * Runs weekly on Sundays at 4 AM UTC (11 PM CT Saturday).
 * Analyzes observations + behavioral data to suggest improvements.
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
    .select("id, household_members!inner(household_id)")
    .eq("status", "active");

  if (usersErr || !users) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  let totalCreated = 0;
  let totalPatterns = 0;
  const results: { user_id: string; created: number; patterns: number; errors: string[] }[] = [];

  for (const user of users) {
    const householdId = (user as unknown as { household_members: { household_id: string }[] })
      .household_members?.[0]?.household_id;

    // Detect patterns first — they feed into suggestion generation
    const patternResult = await detectPatterns(supabase, user.id, householdId || null);
    totalPatterns += patternResult.detected;

    const result = await generateSuggestionsForUser(supabase, user.id, householdId);
    totalCreated += result.created;
    results.push({
      user_id: user.id,
      created: result.created,
      patterns: patternResult.detected,
      errors: [...result.errors, ...patternResult.errors],
    });
  }

  return NextResponse.json({
    total_created: totalCreated,
    total_patterns: totalPatterns,
    total_users: users.length,
    results,
  });
}
