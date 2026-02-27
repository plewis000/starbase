import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";

// PATCH /api/feedback/[id] — Update feedback status, priority, resolution
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const validStatuses = ["new", "acknowledged", "planned", "in_progress", "done", "wont_fix"];
  const validPriorities = ["low", "medium", "high"];

  if (body.status !== undefined && validStatuses.includes(body.status)) {
    updates.status = body.status;
    if (body.status === "done" || body.status === "wont_fix") {
      updates.resolved_at = new Date().toISOString();
    }
  }
  if (body.priority !== undefined && validPriorities.includes(body.priority)) {
    updates.priority = body.priority;
  }
  if (body.resolution_notes !== undefined) {
    updates.resolution_notes = typeof body.resolution_notes === "string" ? body.resolution_notes.trim() : null;
  }
  if (body.tags !== undefined && Array.isArray(body.tags)) {
    updates.tags = body.tags;
  }

  const { data: feedback, error } = await platform(supabase)
    .from("feedback")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ feedback });
}
