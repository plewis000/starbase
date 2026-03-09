import { NextResponse, after } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { createServiceClient } from "@/lib/supabase/service";
import { logActivity, logFieldChanges } from "@/lib/activity-log";
import { createNextRecurrence } from "@/lib/recurrence-engine";
import { notifyTaskAssigned, notifyTaskCompleted, notifyCreditedUsers } from "@/lib/notify";
import { platform, config } from "@/lib/supabase/schemas";
import { getConfigLookups, enrichTasks } from "@/lib/task-enrichment";
import { isValidUUID } from "@/lib/validation";
import { updateTaskSchema } from "@/lib/schemas";
import { inferFrequencyName } from "@/lib/habit-tasks";
import { awardXp, checkAchievements, hasXpBeenAwarded } from "@/lib/gamification";
import { recalculateTaskStreak } from "@/lib/streak-engine";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// =============================================================
// GET /api/tasks/:id — Get single task with all relations
// =============================================================
export const GET = withAuth(async (_request, { supabase, user, ctx }, params) => {
  const id = params?.id;

  // Verify task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const hasAccess = await verifyTaskHouseholdAccess(supabase, id!, memberIds);
  if (!hasAccess) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
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
    .eq("id", id!)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Get config lookups for enrichment
  const lookups = await getConfigLookups(supabase);

  // Enrich the main task
  const task = enrichTasks([rawTask], lookups)[0];

  // Fetch subtasks separately (self-join removed to avoid FK issues)
  const { data: rawSubtasks } = await platform(supabase)
    .from("tasks")
    .select("id, title, status_id, priority_id, assigned_to, due_date")
    .eq("parent_task_id", id!)
    .order("created_at");

  const enrichedSubtasks = (rawSubtasks || []).map((st: any) => ({
    ...st,
    status: st.status_id ? lookups.statuses.get(st.status_id) || null : null,
    priority: st.priority_id ? lookups.priorities.get(st.priority_id) || null : null,
    assignee: st.assigned_to ? lookups.users.get(st.assigned_to) || null : null,
  }));

  // Compute subtask progress
  const doneStatusNames = ["Done", "Completed"];
  const subtaskDone = enrichedSubtasks.filter(
    (st: any) => st.status && doneStatusNames.includes(st.status.name)
  ).length;
  const subtaskProgress = enrichedSubtasks.length > 0
    ? { done: subtaskDone, total: enrichedSubtasks.length }
    : undefined;

  // Fetch dependencies separately (bidirectional — same-schema joins should work)
  const { data: blocks } = await platform(supabase)
    .from("task_dependencies")
    .select("id, depends_on_id, dependency_type")
    .eq("task_id", id!);

  const { data: blockedBy } = await platform(supabase)
    .from("task_dependencies")
    .select("id, task_id, dependency_type")
    .eq("depends_on_id", id!);

  // Fetch activity log
  const { data: activity } = await platform(supabase)
    .from("activity_log")
    .select("*")
    .eq("entity_type", "task")
    .eq("entity_id", id!)
    .order("performed_at", { ascending: false })
    .limit(50);

  // Fetch recurrence chain context if this is a recurring task
  let recurrenceContext: {
    source_id?: string;
    source_title?: string;
    previous_id?: string;
    next_id?: string;
    next_due_date?: string;
    occurrence_count?: number;
  } | undefined;

  if (rawTask.recurrence_rule) {
    const sourceId = rawTask.recurrence_source_id || rawTask.id;

    // Count total occurrences in this chain
    const { count: occurrenceCount } = await platform(supabase)
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .or(`id.eq.${sourceId},recurrence_source_id.eq.${sourceId}`);

    // Find the next (future) occurrence in this chain
    const { data: nextOccurrence } = await platform(supabase)
      .from("tasks")
      .select("id, due_date")
      .eq("recurrence_source_id", sourceId)
      .gt("created_at", rawTask.created_at)
      .order("created_at", { ascending: true })
      .limit(1);

    // Find the previous occurrence
    const { data: prevOccurrence } = await platform(supabase)
      .from("tasks")
      .select("id")
      .or(`id.eq.${sourceId},recurrence_source_id.eq.${sourceId}`)
      .lt("created_at", rawTask.created_at)
      .order("created_at", { ascending: false })
      .limit(1);

    recurrenceContext = {
      source_id: sourceId,
      previous_id: prevOccurrence?.[0]?.id || undefined,
      next_id: nextOccurrence?.[0]?.id || undefined,
      next_due_date: nextOccurrence?.[0]?.due_date || undefined,
      occurrence_count: occurrenceCount || undefined,
    };
  }

  // Habit enrichment: for habit-tasks, add completion history from recurrence chain + linked goals
  let habitData: Record<string, unknown> = {};
  if (rawTask.is_habit) {
    const sourceId = rawTask.recurrence_source_id || rawTask.id;

    // Completion history from recurrence chain (last 90 days)
    const cutoff90 = new Date();
    cutoff90.setDate(cutoff90.getDate() - 90);
    const cutoff90Str = cutoff90.toISOString().split("T")[0];
    const { data: chainHistory } = await platform(supabase)
      .from("tasks")
      .select("id, due_date, completed_at, completion_note, completion_mood")
      .or(`id.eq.${sourceId},recurrence_source_id.eq.${sourceId}`)
      .not("completed_at", "is", null)
      .gte("due_date", cutoff90Str)
      .order("due_date", { ascending: false });

    const checkInHistory = (chainHistory || []).map((h: any) => ({
      id: h.id,
      check_date: h.due_date,
      note: h.completion_note,
      mood: h.completion_mood,
      completed_at: h.completed_at,
    }));

    // linked_goals via goal_tasks
    let linkedGoals: any[] = [];
    const { data: goalLinks } = await platform(supabase)
      .from("goal_tasks")
      .select("goal_id")
      .eq("task_id", id!);
    if (goalLinks && goalLinks.length > 0) {
      const goalIds = goalLinks.map((gl: any) => gl.goal_id);
      const { data: goals } = await platform(supabase)
        .from("goals")
        .select("id, title, status, progress_value")
        .in("id", goalIds);
      linkedGoals = goals || [];
    }

    habitData = {
      check_in_history: checkInHistory,
      linked_goals: linkedGoals,
      frequency_name: inferFrequencyName(rawTask.recurrence_rule),
    };
  }

  return NextResponse.json({
    task: {
      ...task,
      subtasks: enrichedSubtasks,
      subtask_progress: subtaskProgress,
      dependencies: {
        blocks: blocks || [],
        blocked_by: blockedBy || [],
      },
      recurrence_context: recurrenceContext,
      activity: activity || [],
      ...habitData,
    },
  });
});

// =============================================================
// PATCH /api/tasks/:id — Update task fields (partial update)
// =============================================================
export const PATCH = withAuth(async (request, { supabase, user, ctx }, params) => {
  const id = params?.id;

  // Verify task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  // Get current task state (for diff logging)
  const { data: currentTask, error: fetchError } = await platform(supabase)
    .from("tasks")
    .select("*")
    .eq("id", id!)
    .single();

  if (fetchError || !currentTask) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Verify task belongs to household
  if (!memberIds.includes(currentTask.created_by)) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // Validate known fields with Zod (partial, ignores unknown fields)
  const zodResult = updateTaskSchema.safeParse(body);
  if (!zodResult.success) {
    const firstError = zodResult.error.issues[0];
    const path = firstError.path.length > 0 ? `${firstError.path.join(".")}: ` : "";
    return NextResponse.json({ error: `${path}${firstError.message}` }, { status: 400 });
  }

  const updateFields: Record<string, unknown> = {};

  // Handle owner_ids update
  if ("owner_ids" in body && Array.isArray(body.owner_ids)) {
    const validOwners = (body.owner_ids as string[]).filter((oid) => memberIds.includes(oid));
    updateFields.owner_ids = validOwners;
    updateFields.assigned_to = validOwners[0] || null;
    const existingMetadata = (currentTask.metadata as Record<string, unknown>) || {};
    if (existingMetadata.additional_owners) {
      const { additional_owners: _, ...cleanMeta } = existingMetadata;
      updateFields.metadata = cleanMeta;
    }
  }

  // Apply only fields explicitly present in the request body.
  // Zod transforms convert absent fields to null, so we check `field in body`
  // instead of `value !== undefined` to avoid clobbering existing DB values.
  const validatedData = zodResult.data;
  for (const [field, value] of Object.entries(validatedData)) {
    if (field in body && !(field in updateFields)) {
      updateFields[field] = value;
    }
  }

  // Handle metadata merge (not in Zod schema)
  if ("metadata" in body && typeof body.metadata === "object" && body.metadata !== null) {
    const rawMeta = { ...(body.metadata as Record<string, unknown>) };
    delete rawMeta.additional_owners;
    if (updateFields.metadata) {
      updateFields.metadata = { ...(updateFields.metadata as Record<string, unknown>), ...rawMeta };
    } else {
      updateFields.metadata = rawMeta;
    }
  }

  // Sync start_date ↔ schedule_date for backward compat
  if ("start_date" in body && updateFields.start_date !== undefined) {
    updateFields.schedule_date = updateFields.start_date;
  }

  // Handle fields not in Zod schema but still allowed
  for (const field of ["snoozed_until", "workflow_phase"]) {
    if (field in body && !(field in updateFields)) {
      updateFields[field] = body[field];
    }
  }

  // Validate assigned_to is a household member
  if (updateFields.assigned_to && typeof updateFields.assigned_to === "string" && !memberIds.includes(updateFields.assigned_to)) {
    return NextResponse.json({ error: "Cannot assign to user outside your household" }, { status: 403 });
  }

  // Handle credited_to — validated when completing (sent with status_id → Done)
  // Also accepted as a standalone PATCH for editing credit after the fact
  if ("credited_to" in body && Array.isArray(body.credited_to)) {
    const creditedTo: string[] = body.credited_to;
    for (const cid of creditedTo) {
      if (!isValidUUID(cid)) {
        return NextResponse.json({ error: "credited_to must be valid UUIDs" }, { status: 400 });
      }
      if (!memberIds.includes(cid)) {
        return NextResponse.json({ error: `credited_to user ${cid} is not a household member` }, { status: 400 });
      }
    }
    updateFields.credited_to = creditedTo;
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
      updateFields.completed_by = user.id;
      // Credit assignment based on completion_mode
      if (!updateFields.credited_to) {
        const mode = (currentTask as Record<string, unknown>).completion_mode as string || "coop";
        const taskOwnerIds: string[] = (updateFields.owner_ids as string[]) || currentTask.owner_ids || [];
        if (mode === "competitive") {
          // Race mode: only the person who completed it gets credit
          updateFields.credited_to = [user.id];
        } else {
          // Co-op (default): all owners get credit
          updateFields.credited_to = taskOwnerIds.length > 0 ? taskOwnerIds : [user.id];
        }
      }
      isCompletingTask = true;
    } else if (currentTask.completed_at) {
      // If moving away from Done, clear completion fields
      updateFields.completed_at = null;
      updateFields.completed_by = null;
      updateFields.credited_to = [];
    }
  }

  // Update the task
  const { data: updatedTask, error: updateError } = await platform(supabase)
    .from("tasks")
    .update(updateFields)
    .eq("id", id!)
    .select("*")
    .single();

  if (updateError) {
    console.error(updateError.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Log field changes
  await logFieldChanges(
    supabase,
    "task",
    id!,
    user.id,
    currentTask as Record<string, unknown>,
    updateFields
  );

  // Handle recurrence on completion
  let nextRecurrenceId: string | null = null;
  if (isCompletingTask && currentTask.recurrence_rule) {
    // Recalculate streak for habit-tasks before creating next instance
    if (currentTask.is_habit) {
      const freqType = currentTask.recurrence_rule?.includes("FREQ=YEARLY") ? "monthly" as const
        : currentTask.recurrence_rule?.includes("FREQ=WEEKLY") ? "weekly" as const
        : currentTask.recurrence_rule?.includes("FREQ=MONTHLY") ? "monthly" as const
        : "daily" as const;
      const streakResult = await recalculateTaskStreak(supabase, id!, 1, freqType);
      // Pass updated streak to the next instance
      (currentTask as any).streak_current = streakResult.current_streak;
      (currentTask as any).streak_longest = streakResult.longest_streak;
    }

    nextRecurrenceId = await createNextRecurrence(
      supabase,
      { ...currentTask, ...updatedTask },
      user.id,
      { timezone: ctx.timezone }
    );
  }

  // Notify on owner change (non-blocking)
  if (updateFields.owner_ids && Array.isArray(updateFields.owner_ids)) {
    const oldOwnerIds: string[] = currentTask.owner_ids || [];
    const newOwnerIds = updateFields.owner_ids as string[];
    // Notify newly added owners
    for (const ownerId of newOwnerIds) {
      if (!oldOwnerIds.includes(ownerId) && ownerId !== user.id) {
        notifyTaskAssigned(supabase, updatedTask.title, ownerId, user.id, id!)
          .catch((err) => console.error("Assignment notification error:", err));
      }
    }
  } else if (
    updateFields.assigned_to &&
    updateFields.assigned_to !== currentTask.assigned_to
  ) {
    notifyTaskAssigned(
      supabase,
      updatedTask.title,
      updateFields.assigned_to as string,
      user.id,
      id!
    ).catch((err) => console.error("Assignment notification error:", err));

    // "It's Not My Fault" achievement — reassigning a task
    checkAchievements(supabase, user.id, "custom", { custom_type: "task_reassigned" })
      .catch((err) => console.error("Reassign achievement error:", err));
  }

  // Notify on task completion (non-blocking)
  if (isCompletingTask) {
    notifyTaskCompleted(supabase, id!, updatedTask.title, user.id).catch(
      (err) => console.error("Completion notification error:", err)
    );

    // Award XP to all credited users (runs after response, uses service client for cross-user RLS bypass)
    after(async () => {
      try {
        const svc = createServiceClient();
        const creditedTo: string[] = (updatedTask.credited_to as string[]) || [user.id];

        // Map priority to XP — higher priority = more XP
        const { data: priority } = await config(svc)
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

        // Check for speed completion bonus (done within 1 hour of creation) — only for completer
        const createdAt = new Date(currentTask.created_at).getTime();
        const completedAt = Date.now();
        const isSpeedComplete = (completedAt - createdAt) < 3600000; // 1 hour

        // Award full XP to each credited user
        for (const creditedUserId of creditedTo) {
          const alreadyAwarded = await hasXpBeenAwarded(svc, creditedUserId, id!);
          if (alreadyAwarded) continue;

          // Speed bonus only for the person who clicked Done
          const bonusXp = (creditedUserId === user.id && isSpeedComplete) ? 15 : 0;
          const totalXp = xpAmount + bonusXp;

          await awardXp(
            svc,
            creditedUserId,
            totalXp,
            "task_complete",
            `Completed: ${updatedTask.title}${creditedUserId === user.id && isSpeedComplete ? " (speed bonus!)" : ""}`,
            "task",
            id!
          );

          // Check achievements with correct trigger types from config
          await checkAchievements(svc, creditedUserId, "task_count", {
            taskId: id,
            priority: priority?.name,
          });

          // Speed complete achievement (only for the person who clicked Done)
          if (creditedUserId === user.id && isSpeedComplete) {
            await checkAchievements(svc, creditedUserId, "speed_complete", {
              taskId: id,
              created_at: currentTask.created_at,
              completed_at: new Date().toISOString(),
            });
          }

          // Time-based custom achievements
          const now = new Date();
          const hour = now.getUTCHours() - 6; // CT = UTC-6
          const ctHour = hour < 0 ? hour + 24 : hour;
          const dayOfWeek = now.getDay(); // 0=Sun, 5=Fri, 6=Sat

          if (ctHour >= 22 || ctHour < 4) {
            await checkAchievements(svc, creditedUserId, "custom", { custom_type: "night_complete" });
            if (ctHour >= 0 && ctHour < 4) {
              await checkAchievements(svc, creditedUserId, "custom", { custom_type: "late_night_complete" });
            }
          }
          if (dayOfWeek === 5) {
            await checkAchievements(svc, creditedUserId, "custom", { custom_type: "all_tasks_friday" });
          }
          if (dayOfWeek === 0 || dayOfWeek === 6) {
            await checkAchievements(svc, creditedUserId, "custom", { custom_type: "weekend_warrior" });
          }

          // Party achievement: completing a task created by another household member
          if (currentTask.created_by && currentTask.created_by !== creditedUserId) {
            await checkAchievements(svc, creditedUserId, "custom", { custom_type: "party_task_completed" });
          }
        }

        // Notify credited users who aren't the completer
        if (creditedTo.length > 1) {
          await notifyCreditedUsers(
            svc,
            id!,
            updatedTask.title,
            user.id,
            creditedTo,
            xpAmount
          );
        }
      } catch (err) {
        console.error("Gamification error:", err);
      }
    });
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
    .eq("id", id!)
    .single();

  // Enrich with config data
  const lookupsForUpdate = await getConfigLookups(supabase);
  const fullTask = rawUpdatedTask ? enrichTasks([rawUpdatedTask], lookupsForUpdate)[0] : null;

  return NextResponse.json({
    task: fullTask,
    next_recurrence_id: nextRecurrenceId,
  });
});

// =============================================================
// DELETE /api/tasks/:id — Soft delete (archive) or hard delete
// =============================================================
export const DELETE = withAuth(async (request, { supabase, user, ctx }, params) => {
  const id = params?.id;

  // Verify task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const hasAccess = await verifyTaskHouseholdAccess(supabase, id!, memberIds);
  if (!hasAccess) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const hard = request.nextUrl.searchParams.get("hard") === "true";

  if (hard) {
    const { error } = await platform(supabase).from("tasks").delete().eq("id", id!);
    if (error) {
      console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    await logActivity(supabase, {
      entity_type: "task",
      entity_id: id!,
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
      .eq("id", id!);

    if (error) {
      console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    await logActivity(supabase, {
      entity_type: "task",
      entity_id: id!,
      action: "archived",
      performed_by: user.id,
    });
  }

  return NextResponse.json({ success: true });
});
