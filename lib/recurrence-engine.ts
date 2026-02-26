import { SupabaseClient } from "@supabase/supabase-js";
import { getNextOccurrence, formatDateOnly } from "@/lib/recurrence";
import { platform, config } from "@/lib/supabase/schemas";

interface RecurrableTask {
  id: string;
  title: string;
  description: string | null;
  status_id: string;
  priority_id: string | null;
  task_type_id: string | null;
  assigned_to: string | null;
  created_by: string;
  effort_level_id: string | null;
  location_context_id: string | null;
  recurrence_rule: string;
  recurrence_source_id: string | null;
  parent_task_id: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * When a recurring task is completed, create the next instance.
 * Returns the new task ID if created, null otherwise.
 */
export async function createNextRecurrence(
  supabase: SupabaseClient,
  completedTask: RecurrableTask,
  userId: string
): Promise<string | null> {
  const nextDate = getNextOccurrence(completedTask.recurrence_rule);
  if (!nextDate) {
    return null;
  }

  // Get the "To Do" status
  const { data: todoStatus } = await config(supabase)
    .from("task_statuses")
    .select("id")
    .eq("name", "To Do")
    .single();

  if (!todoStatus) {
    console.error("Could not find 'To Do' status for recurrence");
    return null;
  }

  const sourceId = completedTask.recurrence_source_id || completedTask.id;
  const dueDateStr = formatDateOnly(nextDate);

  const { data: newTask, error } = await platform(supabase)
    .from("tasks")
    .insert({
      title: completedTask.title,
      description: completedTask.description,
      status_id: todoStatus.id,
      priority_id: completedTask.priority_id,
      task_type_id: completedTask.task_type_id,
      assigned_to: completedTask.assigned_to,
      created_by: completedTask.created_by,
      effort_level_id: completedTask.effort_level_id,
      location_context_id: completedTask.location_context_id,
      recurrence_rule: completedTask.recurrence_rule,
      recurrence_source_id: sourceId,
      parent_task_id: completedTask.parent_task_id,
      due_date: dueDateStr,
      schedule_date: dueDateStr,
      source: "recurrence",
      metadata: completedTask.metadata,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Recurrence creation error:", error);
    return null;
  }

  // Copy domain memberships
  const { data: memberships } = await platform(supabase)
    .from("task_domain_memberships")
    .select("domain_slug")
    .eq("task_id", completedTask.id);

  if (memberships && memberships.length > 0) {
    await platform(supabase)
      .from("task_domain_memberships")
      .insert(
        memberships.map((m: { domain_slug: string }) => ({
          task_id: newTask.id,
          domain_slug: m.domain_slug,
        }))
      );
  }

  // Copy tags
  const { data: tags } = await platform(supabase)
    .from("task_tags")
    .select("tag_id")
    .eq("task_id", completedTask.id);

  if (tags && tags.length > 0) {
    await platform(supabase)
      .from("task_tags")
      .insert(
        tags.map((t: { tag_id: string }) => ({
          task_id: newTask.id,
          tag_id: t.tag_id,
        }))
      );
  }

  // Copy checklist items (unchecked)
  const { data: checklistItems } = await platform(supabase)
    .from("task_checklist_items")
    .select("title, sort_order")
    .eq("task_id", completedTask.id)
    .order("sort_order");

  if (checklistItems && checklistItems.length > 0) {
    await platform(supabase)
      .from("task_checklist_items")
      .insert(
        checklistItems.map((item: { title: string; sort_order: number }) => ({
          task_id: newTask.id,
          title: item.title,
          sort_order: item.sort_order,
          checked: false,
        }))
      );
  }

  // Log to activity_log
  await platform(supabase)
    .from("activity_log")
    .insert({
      entity_type: "task",
      entity_id: newTask.id,
      action: "created",
      performed_by: userId,
      metadata: {
        source: "recurrence",
        recurrence_source_id: sourceId,
        next_due_date: dueDateStr,
      },
    });

  return newTask.id;
}
