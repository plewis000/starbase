import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { platform } from "@/lib/supabase/schemas";

// =============================================================
// PATCH /api/tasks/:taskId/checklist/:itemId — Toggle/update
// =============================================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: taskId, itemId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updateFields: Record<string, unknown> = {};

  if ("checked" in body) {
    updateFields.checked = body.checked;
    updateFields.checked_at = body.checked ? new Date().toISOString() : null;
    updateFields.checked_by = body.checked ? user.id : null;
  }
  if ("title" in body) {
    updateFields.title = body.title;
  }
  if ("sort_order" in body) {
    updateFields.sort_order = body.sort_order;
  }

  const { data: item, error } = await platform(supabase)
    .from("task_checklist_items")
    .update(updateFields)
    .eq("id", itemId)
    .eq("task_id", taskId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const action = body.checked ? "checked" : body.checked === false ? "unchecked" : "updated";
  await logActivity(supabase, {
    entity_type: "checklist_item",
    entity_id: itemId,
    action,
    performed_by: user.id,
    metadata: { task_id: taskId },
  });

  // Update task's last_touched_at
  await platform(supabase)
    .from("tasks")
    .update({ last_touched_at: new Date().toISOString() })
    .eq("id", taskId);

  // Check if all checklist items are now checked (for automation triggers)
  if (body.checked) {
    const { data: allItems } = await platform(supabase)
      .from("task_checklist_items")
      .select("checked")
      .eq("task_id", taskId);

    const allChecked =
      allItems && allItems.length > 0 && allItems.every((i) => i.checked);
    if (allChecked) {
      await logActivity(supabase, {
        entity_type: "task",
        entity_id: taskId,
        action: "checklist_complete",
        performed_by: user.id,
      });
    }
  }

  return NextResponse.json({ item });
}

// =============================================================
// DELETE /api/tasks/:taskId/checklist/:itemId — Remove item
// =============================================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: taskId, itemId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await platform(supabase)
    .from("task_checklist_items")
    .delete()
    .eq("id", itemId)
    .eq("task_id", taskId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "checklist_item",
    entity_id: itemId,
    action: "deleted",
    performed_by: user.id,
    metadata: { task_id: taskId },
  });

  return NextResponse.json({ success: true });
}
