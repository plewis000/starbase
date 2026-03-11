import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { logActivity } from "@/lib/activity-log";
import { platform, config } from "@/lib/supabase/schemas";
import { getConfigLookups, enrichTasks } from "@/lib/task-enrichment";
import { sanitizeSearchInput, validatePagination, isValidUUID } from "@/lib/validation";
import { getHouseholdMemberIds } from "@/lib/household";
import { createTaskSchema, parseBody } from "@/lib/schemas";
import { inferRecurrenceMode } from "@/lib/recurrence-inference";
import { inferFrequencyName } from "@/lib/habit-tasks";

// =============================================================
// GET /api/tasks — List tasks with filtering, sorting, pagination
// =============================================================
export const GET = withAuth(async (request, { supabase, user, ctx }) => {
  // Scope tasks to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  const params = request.nextUrl.searchParams;

  // Build query (remove cross-schema FK joins, will enrich separately)
  let query = platform(supabase)
    .from("tasks")
    .select(
      `
      *,
      domain_memberships:task_domain_memberships(domain_slug),
      tags:task_tags(*),
      checklist_items:task_checklist_items(id, title, checked, sort_order)
    `,
      { count: "exact" }
    );

  // Household scoping: only show tasks created by household members
  query = query.in("created_by", memberIds);

  // Status filter
  const status = params.get("status");
  if (status) {
    const slugs = status.split(",");
    const { data: statuses } = await config(supabase)
      .from("task_statuses")
      .select("id")
      .in("name", slugs);
    if (statuses && statuses.length > 0) {
      query = query.in(
        "status_id",
        statuses.map((s) => s.id)
      );
    }
  }

  // Priority filter
  const priority = params.get("priority");
  if (priority) {
    const slugs = priority.split(",");
    const { data: priorities } = await config(supabase)
      .from("task_priorities")
      .select("id")
      .in("name", slugs);
    if (priorities && priorities.length > 0) {
      query = query.in(
        "priority_id",
        priorities.map((p) => p.id)
      );
    }
  }

  // Assigned to filter
  const assignedTo = params.get("assigned_to");
  if (assignedTo) {
    if (assignedTo === "me") {
      query = query.eq("assigned_to", user.id);
    } else {
      query = query.eq("assigned_to", assignedTo);
    }
  }

  // Owner filter: uses owner_ids array contains
  const owner = params.get("owner");
  if (owner) {
    const ownerId = owner === "me" ? user.id : owner;
    if (isValidUUID(ownerId)) {
      query = query.contains("owner_ids", [ownerId]);
    }
  }

  // is_habit filter
  const isHabit = params.get("is_habit");
  if (isHabit === "true") {
    query = query.eq("is_habit", true);
  } else if (isHabit === "false") {
    query = query.eq("is_habit", false);
  }

  // Hide old done tasks filter
  const hideDoneDays = params.get("hide_done_days");
  if (hideDoneDays) {
    const days = parseInt(hideDoneDays, 10);
    if (!isNaN(days) && days === -1) {
      // Hide ALL completed tasks
      query = query.is("completed_at", null);
    } else if (!isNaN(days) && days > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      query = query.or(`completed_at.is.null,completed_at.gte.${cutoff.toISOString()}`);
    }
  }

  // Due date filter (timezone-aware)
  const due = params.get("due");
  if (due) {
    const tz = params.get("tz");
    let todayStr: string;
    if (tz) {
      todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    } else {
      todayStr = new Date().toISOString().split("T")[0];
    }
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const todayDate = new Date(ty, tm - 1, td);
    const endOfWeek = new Date(todayDate);
    endOfWeek.setDate(todayDate.getDate() + (7 - todayDate.getDay()));
    const endOfWeekStr = `${endOfWeek.getFullYear()}-${String(endOfWeek.getMonth() + 1).padStart(2, "0")}-${String(endOfWeek.getDate()).padStart(2, "0")}`;

    switch (due) {
      case "today":
        query = query.eq("due_date", todayStr);
        break;
      case "this_week":
        query = query.gte("due_date", todayStr).lte("due_date", endOfWeekStr);
        break;
      case "overdue": {
        // Exclude completed tasks from overdue
        const { data: doneStatus } = await config(supabase)
          .from("task_statuses")
          .select("id")
          .eq("name", "Done")
          .single();
        query = query.lt("due_date", todayStr);
        if (doneStatus) {
          query = query.neq("status_id", doneStatus.id);
        }
        break;
      }
      case "upcoming":
        query = query.gt("due_date", todayStr);
        break;
      case "none":
        query = query.is("due_date", null);
        break;
    }
  }

  // Search filter (sanitized to prevent PostgREST injection)
  const search = params.get("search");
  if (search) {
    const sanitized = sanitizeSearchInput(search);
    if (sanitized.length > 0) {
      query = query.or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
    }
  }

  // Parent task filter (subtasks)
  const parentId = params.get("parent_id");
  if (parentId) {
    query = query.eq("parent_task_id", parentId);
  } else {
    // By default, only return top-level tasks (not subtasks)
    query = query.is("parent_task_id", null);
  }

  // Template filter
  const templateId = params.get("template_id");
  if (templateId) {
    query = query.eq("template_id", templateId);
  }

  // Recurrence filter (routines vs one-off tasks)
  const hasRecurrence = params.get("has_recurrence");
  if (hasRecurrence === "true") {
    query = query.not("recurrence_rule", "is", null);
  } else if (hasRecurrence === "false") {
    query = query.is("recurrence_rule", null);
  }

  // Exclude goal-linked tasks (for standalone tasks view)
  const excludeGoalLinked = params.get("exclude_goal_linked");
  if (excludeGoalLinked === "true") {
    // Fetch goal-linked task IDs and exclude them
    const { data: goalTaskLinks } = await platform(supabase)
      .from("goal_tasks")
      .select("task_id");
    const linkedIds = (goalTaskLinks || []).map((gt: any) => gt.task_id);
    if (linkedIds.length > 0) {
      // PostgREST doesn't support NOT IN directly, so use .not + .in
      query = query.not("id", "in", `(${linkedIds.join(",")})`);
    }
  }

  // Goal-scoped tasks (for project view)
  const goalId = params.get("goal_id");
  if (goalId && isValidUUID(goalId)) {
    const { data: goalTaskLinks } = await platform(supabase)
      .from("goal_tasks")
      .select("task_id")
      .eq("goal_id", goalId);
    const linkedIds = (goalTaskLinks || []).map((gt: any) => gt.task_id);
    if (linkedIds.length > 0) {
      query = query.in("id", linkedIds);
    } else {
      // No tasks linked to this goal — return empty
      return NextResponse.json({ tasks: [], total: 0 });
    }
  }

  // Exclude someday by default
  const includeSomeday = params.get("include_someday");
  if (includeSomeday !== "true") {
    const { data: somedayStatus } = await config(supabase)
      .from("task_statuses")
      .select("id")
      .eq("name", "Someday")
      .single();
    if (somedayStatus) {
      query = query.neq("status_id", somedayStatus.id);
    }
  }

  // Sorting (whitelist valid columns to prevent injection)
  const VALID_SORT_COLUMNS = ["due_date", "priority_id", "created_at", "updated_at", "title", "completed_at", "start_date", "sort_order"];
  const rawSort = params.get("sort") || "due_date";
  const sort = VALID_SORT_COLUMNS.includes(rawSort) ? rawSort : "due_date";
  const direction = params.get("direction") === "desc" ? false : true;
  query = query.order(sort, { ascending: direction, nullsFirst: false });

  // Pagination (validated)
  const { limit, offset } = validatePagination(params.get("limit"), params.get("offset"));
  query = query.range(offset, offset + limit - 1);

  const { data: tasks, error, count } = await query;

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Enrich tasks with config data
  const lookups = await getConfigLookups(supabase);
  const enrichedTasks = enrichTasks(tasks || [], lookups);

  // Fetch subtask counts for all returned tasks
  const taskIds = (tasks || []).map((t: any) => t.id);
  let subtaskCountMap: Record<string, { done: number; total: number }> = {};
  if (taskIds.length > 0) {
    const { data: subtasks } = await platform(supabase)
      .from("tasks")
      .select("parent_task_id, status_id")
      .in("parent_task_id", taskIds);

    if (subtasks && subtasks.length > 0) {
      // Get "Done" status IDs
      const doneStatusIds = new Set<string>();
      for (const [sid, s] of lookups.statuses) {
        if (s.name === "Done" || s.name === "Completed") doneStatusIds.add(sid);
      }

      for (const st of subtasks) {
        if (!st.parent_task_id) continue;
        if (!subtaskCountMap[st.parent_task_id]) {
          subtaskCountMap[st.parent_task_id] = { done: 0, total: 0 };
        }
        subtaskCountMap[st.parent_task_id].total++;
        if (doneStatusIds.has(st.status_id)) {
          subtaskCountMap[st.parent_task_id].done++;
        }
      }
    }
  }

  // Attach subtask progress to enriched tasks
  const tasksWithProgress = enrichedTasks.map((t: any) => ({
    ...t,
    subtask_progress: subtaskCountMap[t.id] || undefined,
  }));

  // Fetch linked goals (projects) for all returned tasks
  let goalMap: Record<string, { id: string; title: string }[]> = {};
  if (taskIds.length > 0) {
    const { data: goalLinks } = await platform(supabase)
      .from("goal_tasks")
      .select("task_id, goal_id")
      .in("task_id", taskIds);

    if (goalLinks && goalLinks.length > 0) {
      const goalIds = [...new Set(goalLinks.map((gl: any) => gl.goal_id))];
      const { data: goals } = await platform(supabase)
        .from("goals")
        .select("id, title")
        .in("id", goalIds);

      const goalLookup = new Map((goals || []).map((g: any) => [g.id, g]));
      for (const gl of goalLinks) {
        const goal = goalLookup.get(gl.goal_id);
        if (!goal) continue;
        if (!goalMap[gl.task_id]) goalMap[gl.task_id] = [];
        goalMap[gl.task_id].push({ id: goal.id, title: goal.title });
      }
    }
  }

  // Add frequency name for habit-tasks (UI display only)
  const finalTasks = tasksWithProgress.map((t: any) => ({
    ...t,
    linked_goals: goalMap[t.id] || [],
    ...(t.is_habit && t.recurrence_rule
      ? { frequency_name: inferFrequencyName(t.recurrence_rule) }
      : {}),
  }));

  return NextResponse.json({ tasks: finalTasks, total: count || 0 });
});

// =============================================================
// POST /api/tasks — Create a task
// =============================================================
export const POST = withAuth(async (request, { supabase, user, ctx }) => {
  // Verify all owners are in the same household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  const parsed = await parseBody(request, createTaskSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const {
    title,
    description,
    status_id,
    priority_id,
    task_type_id,
    assigned_to,
    owner_ids: rawOwnerIds,
    due_date,
    start_date,
    schedule_date,
    effort_level_id,
    location_context_id,
    recurrence_rule,
    recurrence_mode: explicitMode,
    is_habit,
    parent_task_id,
    domain_slugs,
    tag_ids,
    checklist_items,
    completion_mode,
    estimated_minutes,
    actual_minutes,
  } = parsed.data;

  // Infer recurrence mode if not explicitly set
  const recurrence_mode = recurrence_rule
    ? inferRecurrenceMode({ is_habit: is_habit ?? false, explicit_mode: explicitMode })
    : undefined;

  // Build owner_ids: prefer owner_ids, fall back to assigned_to, default to [current_user]
  let ownerIds: string[] = [];
  if (rawOwnerIds && rawOwnerIds.length > 0) {
    ownerIds = rawOwnerIds.filter((id) => memberIds.includes(id));
  } else if (assigned_to) {
    if (!memberIds.includes(assigned_to)) {
      return NextResponse.json({ error: "Cannot assign to user outside your household" }, { status: 403 });
    }
    ownerIds = [assigned_to];
  }

  // If no status provided, default to "To Do"
  let effectiveStatusId = status_id;
  if (!effectiveStatusId) {
    const { data: todoStatus } = await config(supabase)
      .from("task_statuses")
      .select("id")
      .eq("name", "To Do")
      .single();
    effectiveStatusId = todoStatus?.id;
  }

  // Smart due date: if recurring but no due date, calculate first occurrence
  let effectiveDueDate = due_date || null;
  if (recurrence_rule && !effectiveDueDate) {
    const { getNextOccurrence, formatDateOnly } = await import("@/lib/recurrence");
    const nextDate = getNextOccurrence(recurrence_rule, new Date());
    if (nextDate) effectiveDueDate = formatDateOnly(nextDate);
  }

  // 1. Insert task
  const { data: task, error: taskError } = await platform(supabase)
    .from("tasks")
    .insert({
      title,
      description: description || null,
      status_id: effectiveStatusId,
      priority_id: priority_id || null,
      task_type_id: task_type_id || null,
      assigned_to: ownerIds[0] || null,
      owner_ids: ownerIds,
      created_by: user.id,
      due_date: effectiveDueDate,
      start_date: start_date || null,
      schedule_date: start_date || schedule_date || null,
      effort_level_id: effort_level_id || null,
      location_context_id: location_context_id || null,
      recurrence_rule: recurrence_rule || null,
      recurrence_mode: recurrence_mode || "fixed",
      is_habit: is_habit || false,
      parent_task_id: parent_task_id || null,
      completion_mode: completion_mode || "solo",
      estimated_minutes: estimated_minutes || null,
      actual_minutes: actual_minutes || null,
      source: "manual",
    })
    .select("*")
    .single();

  if (taskError) {
    console.error(taskError.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // 2. Insert domain memberships
  if (domain_slugs && Array.isArray(domain_slugs) && domain_slugs.length > 0) {
    await platform(supabase).from("task_domain_memberships").insert(
      domain_slugs.map((slug: string) => ({
        task_id: task.id,
        domain_slug: slug,
      }))
    );
  }

  // 3. Insert tag associations
  const allTagIds = [...(tag_ids && Array.isArray(tag_ids) ? tag_ids : [])];
  // Auto-add "Recurring" tag for tasks with recurrence rules
  const RECURRING_TAG_ID = "3bd462c2-8607-4ddd-816c-c5096de5f02d";
  if (recurrence_rule && !allTagIds.includes(RECURRING_TAG_ID)) {
    allTagIds.push(RECURRING_TAG_ID);
  }
  if (allTagIds.length > 0) {
    await platform(supabase).from("task_tags").insert(
      allTagIds.map((tagId: string) => ({
        task_id: task.id,
        tag_id: tagId,
      }))
    );
  }

  // 4. Insert checklist items
  if (
    checklist_items &&
    Array.isArray(checklist_items) &&
    checklist_items.length > 0
  ) {
    await platform(supabase).from("task_checklist_items").insert(
      checklist_items.map((item: string, index: number) => ({
        task_id: task.id,
        title: item,
        sort_order: index,
      }))
    );
  }

  // 5. Log to activity_log
  await logActivity(supabase, {
    entity_type: "task",
    entity_id: task.id,
    action: "created",
    performed_by: user.id,
  });

  // 6. Fetch full task with relations
  const { data: rawTask } = await platform(supabase)
    .from("tasks")
    .select(
      `
      *,
      domain_memberships:task_domain_memberships(domain_slug),
      tags:task_tags(*),
      checklist_items:task_checklist_items(id, title, checked, sort_order)
    `
    )
    .eq("id", task.id)
    .single();

  // Enrich with config data
  const lookups2 = await getConfigLookups(supabase);
  const fullTask = rawTask ? enrichTasks([rawTask], lookups2)[0] : null;

  return NextResponse.json({ task: fullTask }, { status: 201 });
});
