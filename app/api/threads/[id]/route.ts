import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";

// =============================================================
// GET /api/threads/:id — Get thread with messages
// =============================================================
export const GET = withAuth(async (_request: NextRequest, { supabase, ctx }, params) => {
  const id = params?.id;

  const { data: thread, error } = await platform(supabase)
    .from("threads")
    .select("*")
    .eq("id", id)
    .eq("household_id", ctx.household_id)
    .single();

  if (error || !thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Get comments for this thread using the polymorphic comment system
  const { data: comments } = await platform(supabase)
    .from("comments_v2")
    .select("*")
    .eq("entity_type", "thread")
    .eq("entity_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ thread, comments: comments || [] });
});

// =============================================================
// DELETE /api/threads/:id — Delete thread
// =============================================================
export const DELETE = withAuth(async (_request: NextRequest, { supabase, ctx }, params) => {
  const id = params?.id;

  const { error } = await platform(supabase)
    .from("threads")
    .delete()
    .eq("id", id)
    .eq("household_id", ctx.household_id);

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
