// ============================================================
// FILE: app/api/feedback/[id]/vote/route.ts
// PURPOSE: Upvote/un-vote feedback — simple toggle
// PART OF: The Keep
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { isValidUUID } from "@/lib/validation";

// POST /api/feedback/[id]/vote — toggle vote (upvote if not voted, remove if already voted)
export const POST = withUser(async (_request: NextRequest, { supabase, user }, params) => {
  const id = params?.id;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Check if already voted
  const { data: existing } = await platform(supabase)
    .from("feedback_votes")
    .select("id")
    .eq("feedback_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    // Remove vote
    await platform(supabase)
      .from("feedback_votes")
      .delete()
      .eq("id", existing.id);

    return NextResponse.json({ voted: false });
  }

  // Add vote
  const { error } = await platform(supabase)
    .from("feedback_votes")
    .insert({ feedback_id: id, user_id: user.id });

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ voted: true }, { status: 201 });
});
