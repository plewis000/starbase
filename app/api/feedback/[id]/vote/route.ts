// ============================================================
// FILE: app/api/feedback/[id]/vote/route.ts
// PURPOSE: Upvote/un-vote feedback — simple toggle
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { isValidUUID } from "@/lib/validation";

// POST /api/feedback/[id]/vote — toggle vote (upvote if not voted, remove if already voted)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ voted: true }, { status: 201 });
}
