// Activity API: GET /api/activity/tasks — List tasks (Discord auth)
//               POST /api/activity/tasks — Create task (Discord auth)

import { NextRequest, NextResponse } from "next/server";
import { authenticateActivity } from "@/lib/discord-activity-auth";
import { logActivity } from "@/lib/activity-log";
import { platform, config } from "@/lib/supabase/schemas";
import { getConfigLookups, enrichTasks } from "@/lib/task-enrichment";
import { sanitizeSearchInput, validatePagination, validateRequiredString, isValidUUID } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await authenticateActivity(request.headers.get("Authorization"));
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, memberIds } = auth;
  const params = request.nextUrl.searchParams;

  let query = platform(supabase)
    .from("tasks")
    .select(
      `*,
      domain_memberships:task_domain_memberships(domain_slug),
      tags:task_tags(*),
      checklist_items:task_checklist_items(id, title, checked, sort_order)`,
      { count: "exact" }
    );

  query = query.in("created_by", memberIds);

  // Status filter
  const status = params.get("status");
  if (status) {
    const slugs = status.split(",");
    const { data: statuses } = await config(supabase)
      .from("task_statuses")
      .select("id")
      .in("name", slugs);
    if (statuses?.length) {
      query = query.in("status_id", statuses.map((s) => s.id));
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
    if (priorities?.length) {
      query = query.in("priority_id", priorities.map((p) => p.id));
    }
  }

  // Assigned to filter
  const assignedTo = params.get("assigned_to");
  if (assignedTo) {
    if (assignedTo === "me") {
      query = query.eq("assigned_to", auth.userId);
    } else {
      query = query.eq("assigned_to", assignedTo);
    }
  }

  // Owner filter: uses owner_ids array contains
  const owner = params.get("owner");
  if (owner) {
    const ownerId = owner === "me" ? auth.userId : owner;
    if (isValidUUID(ownerId)) {
      query = query.contains("owner_ids", [ownerId]);
    }
  }

  // Due date filter
  const due = params.get("due");
  if (due) {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
    const endOfWeekStr = endOfWeek.toISOString().split("T")[0];

    switch (due) {
      case "today":
        query = query.eq("due_date", todayStr);
        break;
      case "this_week":
        query = query.gte("due_date", todayStr).lte("due_date", endOfWeekStr);
        break;
      case "overdue": {
        const { data: doneStatus } = await config(supabase)
          .from("task_statuses").select("id").eq("name", "Done").single();
        query = query.lt("due_date", todayStr);
        if (doneStatus) query = query.neq("status_id", doneStatus.id);
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

  // Search
  const search = params.get("search");
  if (search) {
    const sanitized = sanitizeSearchInput(search);
    if (sanitized.length > 0) {
      query = query.or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
    }
  }

  // Parent task filter
  const parentId = params.get("parent_id");
  if (parentId) {
    query = query.eq("parent_task_id", parentId);
  } else {
    query = query.is("parent_task_id", null);
  }

  // Exclude someday by default
  const includeSomeday = params.get("include_someday");
  if (includeSomeday !== "true") {
    const { data: somedayStatus } = await config(supabase)
      .from("task_statuses").select("id").eq("name", "Someday").single();
    if (somedayStatus) query = query.neq("status_id", somedayStatus.id);
  }

  // Sorting
  const VALID_SORT_COLUMNS = ["due_date", "priority_id", "created_at", "updated_at", "title", "completed_at", "start_date", "sort_order"];
  const rawSort = params.get("sort") || "due_date";
  const sort = VALID_SORT_COLUMNS.includes(rawSort) ? rawSort : "due_date";
  const direction = params.get("direction") === "desc" ? false : true;
  query = query.order(sort, { ascending: direction, nullsFirst: false });

  // Pagination
  const { limit, offset } = validatePagination(params.get("limit"), params.get("offset"));
  query = query.range(offset, offset + limit - 1);

  const { data: tasks, error, count } = await query;

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const lookups = await getConfigLookups(supabase);
  const enrichedTasks = enrichTasks(tasks || [], lookups);

  // Subtask counts
  const taskIds = (tasks || []).map((t: any) => t.id);
  let subtaskCountMap: Record<string, { done: number; total: number }> = {};
  if (taskIds.length > 0) {
    const { data: subtasks } = await platform(supabase)
      .from("tasks")
      .select("parent_task_id, status_id")
      .in("parent_task_id", taskIds);

    if (subtasks?.length) {
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

  const tasksWithProgress = enrichedTasks.map((t: any) => ({
    ...t,
    subtask_progress: subtaskCountMap[t.id] || undefined,
  }));

  return NextResponse.json({ tasks: tasksWithProgress, total: count || 0 });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateActivity(request.headers.get("Authorization"));
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, userId, memberIds } = auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const titleCheck = validateRequiredString(body.title, "title", 300);
  if (!titleCheck.valid) {
    return NextResponse.json({ error: titleCheck.error }, { status: 400 });
  }

  // Validate assignee is in household
  if (body.assigned_to && body.assigned_to !== userId) {
    if (!memberIds.includes(body.assigned_to)) {
      return NextResponse.json({ error: "Cannot assign to user outside your household" }, { status: 403 });
    }
  }

  // Default status to "To Do"
  let effectiveStatusId = body.status_id;
  if (!effectiveStatusId) {
    const { data: todoStatus } = await config(supabase)
      .from("task_statuses").select("id").eq("name", "To Do").single();
    effectiveStatusId = todoStatus?.id;
  }

  const { data: task, error: taskError } = await platform(supabase)
    .from("tasks")
    .insert({
      title: titleCheck.value,
      description: body.description || null,
      status_id: effectiveStatusId,
      priority_id: body.priority_id || null,
      assigned_to: body.assigned_to || null,
      created_by: userId,
      due_date: body.due_date || null,
      source: "discord_activity",
    })
    .select("*")
    .single();

  if (taskError) {
    console.error(taskError.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: task.id,
    action: "created",
    performed_by: userId,
  });

  // Fetch enriched task
  const { data: rawTask } = await platform(supabase)
    .from("tasks")
    .select(`*, domain_memberships:task_domain_memberships(domain_slug), tags:task_tags(*), checklist_items:task_checklist_items(id, title, checked, sort_order)`)
    .eq("id", task.id)
    .single();

  const lookups = await getConfigLookups(supabase);
  const fullTask = rawTask ? enrichTasks([rawTask], lookups)[0] : null;

  return NextResponse.json({ task: fullTask }, { status: 201 });
}
