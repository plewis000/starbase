// ============================================================
// FILE: app/api/ai/suggestions/generate/route.ts
// PURPOSE: Trigger suggestion generation for the current user
//          Called by cron job, agent, or manually
// PART OF: Desperado Club
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdContext } from "@/lib/household";
import { generateSuggestionsForUser } from "@/lib/suggestion-engine";

// POST /api/ai/suggestions/generate — generate new suggestions
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);

  const result = await generateSuggestionsForUser(
    supabase,
    user.id,
    ctx?.household_id,
  );

  if (result.errors.length > 0 && result.created === 0) {
    return NextResponse.json({
      message: "No suggestions generated",
      errors: result.errors,
    });
  }

  return NextResponse.json({
    created: result.created,
    errors: result.errors.length > 0 ? result.errors : undefined,
    message: `Generated ${result.created} suggestion(s)`,
  }, { status: 201 });
}
