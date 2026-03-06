import { NextResponse, after } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { createServiceClient } from "@/lib/supabase/service";
import { platform, config } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";
import { awardXp, checkAchievements, hasXpBeenAwarded } from "@/lib/gamification";
import { isValidUUID } from "@/lib/validation";

// =============================================================
// PATCH /api/tasks/bulk — Bulk update tasks
// Body: { task_ids: string[], patch: { status_id?, priority_id?, assigned_to? } }
// =============================================================
export const PATCH = withAuth(async (request, { supabase, user, ctx }) => {
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
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
  const allowedFields = ["status_id", "priority_id", "assigned_to", "owner_ids", "due_date", "task_type_id", "effort_level_id"];
  const uuidFields = ["status_id", "priority_id", "assigned_to", "task_type_id", "effort_level_id"];
  const updateData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (patch[field] !== undefined) {
      // Validate UUID fields
      if (uuidFields.includes(field) && patch[field] !== null && !isValidUUID(patch[field])) {
        return NextResponse.json({ error: `${field} must be a valid UUID` }, { status: 400 });
      }
      updateData[field] = patch[field];
    }
  }
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields in patch" }, { status: 400 });
  }

  // Validate assigned_to is a household member
  if (updateData.assigned_to && typeof updateData.assigned_to === "string" && !memberIds.includes(updateData.assigned_to)) {
    return NextResponse.json({ error: "Cannot assign to user outside your household" }, { status: 403 });
  }

  // Validate owner_ids are all household members
  if (updateData.owner_ids && Array.isArray(updateData.owner_ids)) {
    const validOwners = (updateData.owner_ids as string[]).filter((id) => memberIds.includes(id));
    updateData.owner_ids = validOwners;
    updateData.assigned_to = validOwners[0] || null;
  }

  updateData.last_touched_at = new Date().toISOString();

  // Check if this is a completion (status changing to Done)
  let isCompletingTasks = false;
  if (updateData.status_id) {
    const { data: newStatus } = await config(supabase)
      .from("task_statuses")
      .select("name")
      .eq("id", updateData.status_id as string)
      .single();

    if (newStatus?.name === "Done") {
      isCompletingTasks = true;
      updateData.completed_at = new Date().toISOString();
      updateData.completed_by = user.id;
      updateData.credited_to = [user.id];
    }
  }

  // If completing, only apply completion fields to tasks not already completed
  if (isCompletingTasks) {
    // Get tasks that are already completed (to exclude from completion side effects)
    const { data: existingTasks } = await platform(supabase)
      .from("tasks")
      .select("id, completed_at, priority_id")
      .in("id", task_ids);

    const alreadyCompleted = new Set(
      (existingTasks || []).filter(t => t.completed_at).map(t => t.id)
    );
    const newlyCompleting = task_ids.filter((tid: string) => !alreadyCompleted.has(tid));

    // Update all tasks
    const { error } = await platform(supabase)
      .from("tasks")
      .update(updateData)
      .in("id", task_ids);

    if (error) {
      console.error("Bulk update error:", error.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    // Award XP for newly completed tasks (after response)
    if (newlyCompleting.length > 0) {
      const taskPriorityMap = new Map<string, string>();
      for (const t of existingTasks || []) {
        taskPriorityMap.set(t.id, t.priority_id);
      }

      after(async () => {
        try {
          const svc = createServiceClient();

          // Fetch priority names
          const { data: priorities } = await config(supabase)
            .from("task_priorities")
            .select("id, name");
          const priorityNameMap = new Map<string, string>();
          for (const p of priorities || []) priorityNameMap.set(p.id, p.name);

          const priorityXp: Record<string, number> = {
            Critical: 100, High: 50, Medium: 25, Low: 10,
          };

          for (const taskId of newlyCompleting) {
            const alreadyAwarded = await hasXpBeenAwarded(svc, user.id, taskId);
            if (alreadyAwarded) continue;

            const priorityName = priorityNameMap.get(taskPriorityMap.get(taskId) || "") || "Medium";
            const xpAmount = priorityXp[priorityName] || 25;

            await awardXp(
              svc,
              user.id,
              xpAmount,
              "task_complete",
              `Completed (bulk): task`,
              "task",
              taskId
            );

            await checkAchievements(svc, user.id, "task_complete", {
              taskId,
              priority: priorityName,
            });
          }
        } catch (err) {
          console.error("Bulk gamification error:", err);
        }
      });
    }

    return NextResponse.json({ success: true, updated: task_ids.length });
  }

  // Non-completion bulk update (original path)
  const { error } = await platform(supabase)
    .from("tasks")
    .update(updateData)
    .in("id", task_ids);

  if (error) {
    console.error("Bulk update error:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: task_ids.length });
});
