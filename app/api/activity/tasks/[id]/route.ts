// Activity API: PATCH /api/activity/tasks/:id — Update task (Discord auth)

import { NextRequest, NextResponse } from "next/server";
import { authenticateActivity } from "@/lib/discord-activity-auth";
import { logFieldChanges } from "@/lib/activity-log";
import { platform, config } from "@/lib/supabase/schemas";
import { getConfigLookups, enrichTasks } from "@/lib/task-enrichment";
import { isValidUUID } from "@/lib/validation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateActivity(request.headers.get("Authorization"));
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, userId, memberIds } = auth;

  // Get current task
  const { data: currentTask, error: fetchError } = await platform(supabase)
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !currentTask) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Verify household access
  if (!memberIds.includes(currentTask.created_by)) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updateFields: Record<string, unknown> = {};
  const allowedFields = [
    "title", "description", "status_id", "priority_id", "assigned_to",
    "due_date", "schedule_date",
  ];
  const uuidFields = ["status_id", "priority_id", "assigned_to"];

  for (const field of allowedFields) {
    if (field in body) {
      if (uuidFields.includes(field) && body[field] !== null) {
        if (!isValidUUID(body[field])) {
          return NextResponse.json({ error: `${field} must be a valid UUID` }, { status: 400 });
        }
      }
      if (field === "title" && typeof body[field] === "string") {
        const trimmed = body[field].trim();
        if (trimmed.length === 0 || trimmed.length > 300) {
          return NextResponse.json({ error: "title must be 1-300 characters" }, { status: 400 });
        }
        updateFields[field] = trimmed;
        continue;
      }
      updateFields[field] = body[field];
    }
  }

  updateFields.last_touched_at = new Date().toISOString();

  // Check if completing
  let isCompletingTask = false;
  if (updateFields.status_id && updateFields.status_id !== currentTask.status_id) {
    const { data: newStatus } = await config(supabase)
      .from("task_statuses").select("name")
      .eq("id", updateFields.status_id as string).single();

    if (newStatus?.name === "Done") {
      updateFields.completed_at = new Date().toISOString();
      isCompletingTask = true;
    } else if (currentTask.completed_at) {
      updateFields.completed_at = null;
    }
  }

  const { data: updatedTask, error: updateError } = await platform(supabase)
    .from("tasks")
    .update(updateFields)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    console.error(updateError.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logFieldChanges(supabase, "task", id, userId, currentTask as Record<string, unknown>, updateFields);

  // Fetch enriched
  const { data: rawTask } = await platform(supabase)
    .from("tasks")
    .select(`*, domain_memberships:task_domain_memberships(domain_slug), tags:task_tags(*), checklist_items:task_checklist_items(id, title, checked, sort_order)`)
    .eq("id", id)
    .single();

  const lookups = await getConfigLookups(supabase);
  const fullTask = rawTask ? enrichTasks([rawTask], lookups)[0] : null;

  return NextResponse.json({ task: fullTask, completed: isCompletingTask });
}
