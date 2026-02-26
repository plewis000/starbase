import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { platform, config } from "@/lib/supabase/schemas";
import { getConfigLookups, enrichTasks } from "@/lib/task-enrichment";
import { sanitizeSearchInput, validatePagination, validateRequiredString, isValidUUID } from "@/lib/validation";

// =============================================================
// GET /api/tasks — List tasks with filtering, sorting, pagination
// =============================================================
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich tasks with config data
  const lookups = await getConfigLookups(supabase);
  const enrichedTasks = enrichTasks(tasks || [], lookups);

  return NextResponse.json({ tasks: enrichedTasks, total: count || 0 });
}

// =============================================================
// POST /api/tasks — Create a task
// =============================================================
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    title,
    description,
    status_id,
    priority_id,
    task_type_id,
    assigned_to,
    due_date,
    schedule_date,
    effort_level_id,
    location_context_id,
    recurrence_rule,
    parent_task_id,
    domain_slugs,
    tag_ids,
    checklist_items,
  } = body;

  // Validate title
  const titleCheck = validateRequiredString(title, "title", 300);
  if (!titleCheck.valid) {
    return NextResponse.json({ error: titleCheck.error }, { status: 400 });
  }

  // Validate UUID fields if provided
  const uuidFields = { status_id, priority_id, task_type_id, assigned_to, effort_level_id, location_context_id, parent_task_id };
  for (const [field, val] of Object.entries(uuidFields)) {
    if (val && !isValidUUID(val)) {
      return NextResponse.json({ error: `${field} must be a valid UUID` }, { status: 400 });
    }
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

  // 1. Insert task
  const { data: task, error: taskError } = await platform(supabase)
    .from("tasks")
    .insert({
      title: titleCheck.value,
      description: description || null,
      status_id: effectiveStatusId,
      priority_id: priority_id || null,
      task_type_id: task_type_id || null,
      assigned_to: assigned_to || null,
      created_by: user.id,
      due_date: due_date || null,
      schedule_date: schedule_date || null,
      effort_level_id: effort_level_id || null,
      location_context_id: location_context_id || null,
      recurrence_rule: recurrence_rule || null,
      parent_task_id: parent_task_id || null,
      source: "manual",
    })
    .select("*")
    .single();

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
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
  if (tag_ids && Array.isArray(tag_ids) && tag_ids.length > 0) {
    await platform(supabase).from("task_tags").insert(
      tag_ids.map((tagId: string) => ({
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
}
