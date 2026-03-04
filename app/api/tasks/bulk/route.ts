import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext, getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// =============================================================
// PATCH /api/tasks/bulk — Bulk update tasks
// Body: { task_ids: string[], patch: { status_id?, priority_id?, assigned_to? } }
// =============================================================
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household found" }, { status: 404 });
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  const body = await request.json();
  const { task_ids, patch } = body;

  if (!Array.isArray(task_ids) || task_ids.length === 0) {
    return NextResponse.json({ error: "task_ids required" }, { status: 400 });
  }

  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ error: "patch required" }, { status: 400 });
  }

  // Verify all tasks belong to household
  for (const taskId of task_ids) {
    if (!(await verifyTaskHouseholdAccess(supabase, taskId, memberIds))) {
      return NextResponse.json({ error: `Task ${taskId} not found` }, { status: 404 });
    }
  }

  // Build the update object from allowed fields
  const allowedFields = ["status_id", "priority_id", "assigned_to", "due_date", "task_type_id"];
  const updateData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (patch[field] !== undefined) updateData[field] = patch[field];
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields in patch" }, { status: 400 });
  }

  const { error } = await platform(supabase)
    .from("tasks")
    .update(updateData)
    .in("id", task_ids);

  if (error) {
    console.error("Bulk update error:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: task_ids.length });
}

// =============================================================
// DELETE /api/tasks/bulk — Bulk delete tasks
// Body: { task_ids: string[] }
// =============================================================
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household found" }, { status: 404 });
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  const body = await request.json();
  const { task_ids } = body;

  if (!Array.isArray(task_ids) || task_ids.length === 0) {
    return NextResponse.json({ error: "task_ids required" }, { status: 400 });
  }

  for (const taskId of task_ids) {
    if (!(await verifyTaskHouseholdAccess(supabase, taskId, memberIds))) {
      return NextResponse.json({ error: `Task ${taskId} not found` }, { status: 404 });
    }
  }

  const { error } = await platform(supabase)
    .from("tasks")
    .delete()
    .in("id", task_ids);

  if (error) {
    console.error("Bulk delete error:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: task_ids.length });
}
