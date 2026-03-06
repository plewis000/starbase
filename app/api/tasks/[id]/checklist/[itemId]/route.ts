import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { logActivity } from "@/lib/activity-log";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// =============================================================
// PATCH /api/tasks/:taskId/checklist/:itemId — Toggle/update
// =============================================================
export const PATCH = withAuth(async (request, { supabase, user, ctx }, params) => {
  const taskId = params?.id;
  const itemId = params?.itemId;

  // Verify task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, taskId!, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const updateFields: Record<string, unknown> = {};

  if ("checked" in body) {
    if (typeof body.checked !== "boolean") {
      return NextResponse.json({ error: "checked must be a boolean" }, { status: 400 });
    }
    updateFields.checked = body.checked;
    updateFields.checked_at = body.checked ? new Date().toISOString() : null;
    updateFields.checked_by = body.checked ? user.id : null;
  }
  if ("title" in body) {
    if (typeof body.title !== "string" || body.title.trim().length === 0 || body.title.length > 500) {
      return NextResponse.json({ error: "title must be a non-empty string (max 500 chars)" }, { status: 400 });
    }
    updateFields.title = body.title.trim();
  }
  if ("sort_order" in body) {
    if (typeof body.sort_order !== "number" || body.sort_order < 0 || body.sort_order > 1000) {
      return NextResponse.json({ error: "sort_order must be a number between 0 and 1000" }, { status: 400 });
    }
    updateFields.sort_order = body.sort_order;
  }

  const { data: item, error } = await platform(supabase)
    .from("task_checklist_items")
    .update(updateFields)
    .eq("id", itemId!)
    .eq("task_id", taskId!)
    .select("*")
    .single();

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const action = body.checked ? "checked" : body.checked === false ? "unchecked" : "updated";
  await logActivity(supabase, {
    entity_type: "checklist_item",
    entity_id: itemId!,
    action,
    performed_by: user.id,
    metadata: { task_id: taskId },
  });

  // Update task's last_touched_at
  await platform(supabase)
    .from("tasks")
    .update({ last_touched_at: new Date().toISOString() })
    .eq("id", taskId!);

  // Check if all checklist items are now checked (for automation triggers)
  if (body.checked) {
    const { data: allItems } = await platform(supabase)
      .from("task_checklist_items")
      .select("checked")
      .eq("task_id", taskId!);

    const allChecked =
      allItems && allItems.length > 0 && allItems.every((i) => i.checked);
    if (allChecked) {
      await logActivity(supabase, {
        entity_type: "task",
        entity_id: taskId!,
        action: "checklist_complete",
        performed_by: user.id,
      });
    }
  }

  return NextResponse.json({ item });
});

// =============================================================
// DELETE /api/tasks/:taskId/checklist/:itemId — Remove item
// =============================================================
export const DELETE = withAuth(async (_request, { supabase, user, ctx }, params) => {
  const taskId = params?.id;
  const itemId = params?.itemId;

  // Verify task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, taskId!, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { error } = await platform(supabase)
    .from("task_checklist_items")
    .delete()
    .eq("id", itemId!)
    .eq("task_id", taskId!);

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "checklist_item",
    entity_id: itemId!,
    action: "deleted",
    performed_by: user.id,
    metadata: { task_id: taskId },
  });

  return NextResponse.json({ success: true });
});
