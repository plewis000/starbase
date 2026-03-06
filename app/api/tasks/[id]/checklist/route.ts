import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { logActivity } from "@/lib/activity-log";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// =============================================================
// GET /api/tasks/:id/checklist — List checklist items
// =============================================================
export const GET = withAuth(async (_request, { supabase, user, ctx }, params) => {
  const id = params?.id;

  // Verify task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id!, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { data: items, error } = await platform(supabase)
    .from("task_checklist_items")
    .select("*")
    .eq("task_id", id!)
    .order("sort_order");

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ items: items || [] });
});

// =============================================================
// POST /api/tasks/:id/checklist — Add checklist item
// =============================================================
export const POST = withAuth(async (request, { supabase, user, ctx }, params) => {
  const id = params?.id;

  // Verify task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id!, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { title, sort_order } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (title.length > 500) {
    return NextResponse.json({ error: "Title must be 500 characters or fewer" }, { status: 400 });
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
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
    .eq("id", id!);

  return NextResponse.json({ item }, { status: 201 });
});
