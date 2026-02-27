import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity, logFieldChanges } from "@/lib/activity-log";
import { createNextRecurrence } from "@/lib/recurrence-engine";
import { notifyTaskAssigned, notifyTaskCompleted } from "@/lib/notify";
import { platform, config } from "@/lib/supabase/schemas";
import { getConfigLookups, enrichTasks } from "@/lib/task-enrichment";
import { isValidUUID } from "@/lib/validation";
import { awardXp, checkAchievements } from "@/lib/gamification";

// =============================================================
// GET /api/tasks/:id — Get single task with all relations
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

  const { data: rawTask, error } = await platform(supabase)
    .from("tasks")
    .select(
      `
      *,
      domain_memberships:task_domain_memberships(domain_slug),
      tags:task_tags(*),
      checklist_items:task_checklist_items(id, title, checked, checked_at, checked_by, sort_order),
      comments:task_comments(id, user_id, body, created_at, updated_at)
    `
    )
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get config lookups for enrichment
  const lookups = await getConfigLookups(supabase);

  // Enrich the main task
  const task = enrichTasks([rawTask], lookups)[0];

  // Fetch subtasks separately (self-join removed to avoid FK issues)
  const { data: rawSubtasks } = await platform(supabase)
    .from("tasks")
    .select("id, title, status_id, priority_id, assigned_to, due_date")
    .eq("parent_task_id", id)
    .order("created_at");

  const enrichedSubtasks = (rawSubtasks || []).map((st: any) => ({
    ...st,
    status: st.status_id ? lookups.statuses.get(st.status_id) || null : null,
    priority: st.priority_id ? lookups.priorities.get(st.priority_id) || null : null,
    assignee: st.assigned_to ? lookups.users.get(st.assigned_to) || null : null,
  }));

  // Fetch dependencies separately (bidirectional — same-schema joins should work)
  const { data: blocks } = await platform(supabase)
    .from("task_dependencies")
    .select("id, depends_on_id, dependency_type")
    .eq("task_id", id);

  const { data: blockedBy } = await platform(supabase)
    .from("task_dependencies")
    .select("id, task_id, dependency_type")
    .eq("depends_on_id", id);

  // Fetch activity log
  const { data: activity } = await platform(supabase)
    .from("activity_log")
    .select("*")
    .eq("entity_type", "task")
    .eq("entity_id", id)
    .order("performed_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    task: {
      ...task,
      subtasks: enrichedSubtasks,
      dependencies: {
        blocks: blocks || [],
        blocked_by: blockedBy || [],
      },
      activity: activity || [],
    },
  });
}

// =============================================================
// PATCH /api/tasks/:id — Update task fields (partial update)
// =============================================================
export async function PATCH(
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

  // Get current task state (for diff logging)
  const { data: currentTask, error: fetchError } = await platform(supabase)
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !currentTask) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const body = await request.json();
  const updateFields: Record<string, unknown> = {};

  // Only include fields that were actually sent
  const allowedFields = [
    "title",
    "description",
    "status_id",
    "priority_id",
    "task_type_id",
    "assigned_to",
    "due_date",
    "schedule_date",
    "effort_level_id",
    "location_context_id",
    "recurrence_rule",
    "parent_task_id",
    "estimated_minutes",
    "actual_minutes",
    "snoozed_until",
    "workflow_phase",
    "metadata",
  ];

  // UUID fields that need format validation
  const uuidUpdateFields = [
    "status_id", "priority_id", "task_type_id", "assigned_to",
    "effort_level_id", "location_context_id", "parent_task_id",
  ];

  for (const field of allowedFields) {
    if (field in body) {
      // Validate UUID fields
      if (uuidUpdateFields.includes(field) && body[field] !== null) {
        if (!isValidUUID(body[field])) {
          return NextResponse.json(
            { error: `${field} must be a valid UUID` },
            { status: 400 }
          );
        }
      }
      // Validate title length
      if (field === "title" && typeof body[field] === "string") {
        const trimmed = body[field].trim();
        if (trimmed.length === 0) {
          return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
        }
        if (trimmed.length > 300) {
          return NextResponse.json({ error: "title must be 300 characters or fewer" }, { status: 400 });
        }
        updateFields[field] = trimmed;
        continue;
      }
      // Validate numeric fields
      if ((field === "estimated_minutes" || field === "actual_minutes") && body[field] !== null) {
        const num = body[field];
        if (typeof num !== "number" || num < 0 || num > 525600) {
          return NextResponse.json(
            { error: `${field} must be a number between 0 and 525600` },
            { status: 400 }
          );
        }
      }
      updateFields[field] = body[field];
    }
  }

  // Always update last_touched_at
  updateFields.last_touched_at = new Date().toISOString();

  // Check if status is changing to "Done"
  let isCompletingTask = false;
  if (updateFields.status_id && updateFields.status_id !== currentTask.status_id) {
    const { data: newStatus } = await config(supabase)
      .from("task_statuses")
      .select("name")
      .eq("id", updateFields.status_id as string)
      .single();

    if (newStatus?.name === "Done") {
      updateFields.completed_at = new Date().toISOString();
      isCompletingTask = true;
    } else if (currentTask.completed_at) {
      // If moving away from Done, clear completed_at
      updateFields.completed_at = null;
    }
  }

  // Update the task
  const { data: updatedTask, error: updateError } = await platform(supabase)
    .from("tasks")
    .update(updateFields)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Log field changes
  await logFieldChanges(
    supabase,
    "task",
    id,
    user.id,
    currentTask as Record<string, unknown>,
    updateFields
  );

  // Handle recurrence on completion
  let nextRecurrenceId: string | null = null;
  if (isCompletingTask && currentTask.recurrence_rule) {
    nextRecurrenceId = await createNextRecurrence(
      supabase,
      { ...currentTask, ...updatedTask },
      user.id
    );
  }

  // Notify on assignment change (non-blocking)
  if (
    updateFields.assigned_to &&
    updateFields.assigned_to !== currentTask.assigned_to
  ) {
    notifyTaskAssigned(
      supabase,
      updatedTask.title,
      updateFields.assigned_to as string,
      user.id,
      id
    ).catch((err) => console.error("Assignment notification error:", err));
  }

  // Notify on task completion (non-blocking)
  if (isCompletingTask) {
    notifyTaskCompleted(supabase, id, updatedTask.title, user.id).catch(
      (err) => console.error("Completion notification error:", err)
    );

    // Award XP for completing the task (non-blocking)
    (async () => {
      try {
        // Map priority to XP — higher priority = more XP
        const { data: priority } = await config(supabase)
          .from("task_priorities")
          .select("name")
          .eq("id", currentTask.priority_id)
          .single();

        const priorityXp: Record<string, number> = {
          Critical: 100,
          High: 50,
          Medium: 25,
          Low: 10,
        };
        const xpAmount = priorityXp[priority?.name || "Medium"] || 25;

        // Check for speed completion bonus (done within 1 hour of creation)
        const createdAt = new Date(currentTask.created_at).getTime();
        const completedAt = Date.now();
        const isSpeedComplete = (completedAt - createdAt) < 3600000; // 1 hour
        const bonusXp = isSpeedComplete ? 15 : 0;

        await awardXp(
          supabase,
          user.id,
          xpAmount + bonusXp,
          "task_complete",
          `Completed: ${updatedTask.title}${isSpeedComplete ? " (speed bonus!)" : ""}`,
          id
        );

        // Check for task-related achievements
        await checkAchievements(supabase, user.id, "task_complete", {
          taskId: id,
          priority: priority?.name,
          isSpeedComplete,
        });
      } catch (err) {
        console.error("Gamification error:", err);
      }
    })();
  }

  // Fetch full updated task
  const { data: rawUpdatedTask } = await platform(supabase)
    .from("tasks")
    .select(
      `
      *,
      domain_memberships:task_domain_memberships(domain_slug),
      tags:task_tags(*),
      checklist_items:task_checklist_items(id, title, checked, sort_order)
    `
    )
    .eq("id", id)
    .single();

  // Enrich with config data
  const lookupsForUpdate = await getConfigLookups(supabase);
  const fullTask = rawUpdatedTask ? enrichTasks([rawUpdatedTask], lookupsForUpdate)[0] : null;

  return NextResponse.json({
    task: fullTask,
    next_recurrence_id: nextRecurrenceId,
  });
}

// =============================================================
// DELETE /api/tasks/:id — Soft delete (archive) or hard delete
// =============================================================
export async function DELETE(
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

  const hard = request.nextUrl.searchParams.get("hard") === "true";

  if (hard) {
    const { error } = await platform(supabase).from("tasks").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logActivity(supabase, {
      entity_type: "task",
      entity_id: id,
      action: "deleted",
      performed_by: user.id,
    });
  } else {
    // Soft delete: set status to Archived
    const { data: archivedStatus } = await config(supabase)
      .from("task_statuses")
      .select("id")
      .eq("name", "Archived")
      .single();

    if (!archivedStatus) {
      return NextResponse.json(
        { error: "Archived status not found" },
        { status: 500 }
      );
    }

    const { error } = await platform(supabase)
      .from("tasks")
      .update({ status_id: archivedStatus.id, last_touched_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logActivity(supabase, {
      entity_type: "task",
      entity_id: id,
      action: "archived",
      performed_by: user.id,
    });
  }

  return NextResponse.json({ success: true });
}
