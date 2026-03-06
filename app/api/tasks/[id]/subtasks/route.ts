import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { logActivity } from "@/lib/activity-log";
import { platform, config } from "@/lib/supabase/schemas";
import { getConfigLookups, enrichSubtasks } from "@/lib/task-enrichment";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";
import { isValidUUID } from "@/lib/validation";

// =============================================================
// GET /api/tasks/:id/subtasks — List sub-tasks
// =============================================================
export const GET = withAuth(async (_request, { supabase, user, ctx }, params) => {
  const id = params?.id;

  // Verify parent task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id!, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { data: rawSubtasks, error } = await platform(supabase)
    .from("tasks")
    .select(
      `
      *,
      checklist_items:task_checklist_items(id, title, checked)
    `
    )
    .eq("parent_task_id", id!)
    .order("created_at");

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Enrich with config data
  const lookups = await getConfigLookups(supabase);
  const subtasks = enrichSubtasks(rawSubtasks || [], lookups);

  return NextResponse.json({ subtasks });
});

// =============================================================
// POST /api/tasks/:id/subtasks — Create sub-task
// =============================================================
export const POST = withAuth(async (request, { supabase, user, ctx }, params) => {
  const id = params?.id;

  // Verify parent task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id!, memberIds))) {
    return NextResponse.json({ error: "Parent task not found" }, { status: 404 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { title, description, status_id, priority_id, assigned_to, due_date } =
    body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json(
      { error: "Title is required" },
      { status: 400 }
    );
  }
  if (title.length > 300) {
    return NextResponse.json({ error: "Title must be 300 characters or fewer" }, { status: 400 });
  }

  // Validate UUID fields if provided
  const uuidFields = { status_id, priority_id, assigned_to };
  for (const [field, val] of Object.entries(uuidFields)) {
    if (val && !isValidUUID(val)) {
      return NextResponse.json({ error: `${field} must be a valid UUID` }, { status: 400 });
    }
  }

  // Default to "To Do" status
  let effectiveStatusId = status_id;
  if (!effectiveStatusId) {
    const { data: todoStatus } = await config(supabase)
      .from("task_statuses")
      .select("id")
      .eq("name", "To Do")
      .single();
    effectiveStatusId = todoStatus?.id;
  }

  const { data: rawSubtask, error } = await platform(supabase)
    .from("tasks")
    .insert({
      title: title.trim(),
      description: description || null,
      status_id: effectiveStatusId,
      priority_id: priority_id || null,
      assigned_to: assigned_to || null,
      created_by: user.id,
      due_date: due_date || null,
      parent_task_id: id,
      source: "manual",
    })
    .select(
      `
      *
    `
    )
    .single();

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: rawSubtask.id,
    action: "created",
    performed_by: user.id,
    metadata: { parent_task_id: id },
  });

  // Enrich with config data
  const lookups2 = await getConfigLookups(supabase);
  const subtask = enrichSubtasks([rawSubtask], lookups2)[0];

  return NextResponse.json({ subtask }, { status: 201 });
});
