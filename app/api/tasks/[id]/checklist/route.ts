import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext, getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// =============================================================
// GET /api/tasks/:id/checklist — List checklist items
// =============================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify task belongs to user's household
  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household found" }, { status: 404 });
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { data: items, error } = await platform(supabase)
    .from("task_checklist_items")
    .select("*")
    .eq("task_id", id)
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: items || [] });
}

// =============================================================
// POST /api/tasks/:id/checklist — Add checklist item
// =============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify task belongs to user's household
  const ctxPost = await getHouseholdContext(supabase, user.id);
  if (!ctxPost) return NextResponse.json({ error: "No household found" }, { status: 404 });
  const memberIdsPost = await getHouseholdMemberIds(supabase, ctxPost.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id, memberIdsPost))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { title, sort_order } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const { data: item, error } = await platform(supabase)
    .from("task_checklist_items")
    .insert({
      task_id: id,
      title: title.trim(),
      sort_order: sort_order ?? 0,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "checklist_item",
    entity_id: item.id,
    action: "created",
    performed_by: user.id,
    metadata: { task_id: id },
  });

  // Update task's last_touched_at
  await platform(supabase)
    .from("tasks")
    .update({ last_touched_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ item }, { status: 201 });
}
