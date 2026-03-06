import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";

// =============================================================
// GET /api/threads — List threads
// =============================================================
export const GET = withAuth(async (_request: NextRequest, { supabase, ctx }) => {
  const { data: threads, error } = await platform(supabase)
    .from("threads")
    .select("*")
    .eq("household_id", ctx.household_id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ threads: threads || [] });
});

// =============================================================
// POST /api/threads — Create thread
// Body: { title, entity_type?, entity_id? }
// =============================================================
export const POST = withAuth(async (request: NextRequest, { supabase, user, ctx }) => {
  const body = await request.json();
  const { title, entity_type, entity_id } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const { data: thread, error } = await platform(supabase)
    .from("threads")
    .insert({
      title: title.trim(),
      household_id: ctx.household_id,
      created_by: user.id,
      entity_type: entity_type || null,
      entity_id: entity_id || null,
    })
    .select()
    .single();

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ thread }, { status: 201 });
});
