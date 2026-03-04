import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";

// =============================================================
// GET /api/threads/:id — Get thread with messages
// =============================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household" }, { status: 404 });

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
}

// =============================================================
// DELETE /api/threads/:id — Delete thread
// =============================================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household" }, { status: 404 });

  const { error } = await platform(supabase)
    .from("threads")
    .delete()
    .eq("id", id)
    .eq("household_id", ctx.household_id);

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
