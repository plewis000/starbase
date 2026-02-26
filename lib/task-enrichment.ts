import { SupabaseClient } from "@supabase/supabase-js";
import { config, platform } from "@/lib/supabase/schemas";

/**
 * Task enrichment helper for cross-schema FK resolution
 *
 * PostgREST cannot resolve foreign keys that cross schemas:
 *   - platform.tasks -> config.task_statuses (cross-schema)
 *   - platform.tasks -> auth.users (auth schema not exposed)
 * This helper fetches all lookup data once and caches it in Maps for O(1) enrichment.
 */

export type ConfigLookups = Awaited<ReturnType<typeof getConfigLookups>>;

/**
 * Fetch all config + user lookups once per request and cache in Maps
 */
export async function getConfigLookups(supabase: SupabaseClient) {
  const [statuses, priorities, types, efforts, locations, tags, users] = await Promise.all([
    config(supabase).from("task_statuses").select("*"),
    config(supabase).from("task_priorities").select("*"),
    config(supabase).from("task_types").select("*"),
    config(supabase).from("effort_levels").select("*"),
    config(supabase).from("location_contexts").select("*"),
    config(supabase).from("tags").select("*"),
    platform(supabase).from("users").select("id, full_name, email, avatar_url"),
  ]);

  return {
    statuses: new Map((statuses.data || []).map((s) => [s.id, s])),
    priorities: new Map((priorities.data || []).map((p) => [p.id, p])),
    types: new Map((types.data || []).map((t) => [t.id, t])),
    efforts: new Map((efforts.data || []).map((e) => [e.id, e])),
    locations: new Map((locations.data || []).map((l) => [l.id, l])),
    tags: new Map((tags.data || []).map((t) => [t.id, t])),
    users: new Map((users.data || []).map((u) => [u.id, u])),
  };
}

/**
 * Enrich a single task with resolved config data
 * Matches the shape that PostgREST would return with cross-schema joins
 */
export function enrichTask(task: any, lookups: ConfigLookups) {
  return {
    ...task,
    status: task.status_id ? lookups.statuses.get(task.status_id) || null : null,
    priority: task.priority_id ? lookups.priorities.get(task.priority_id) || null : null,
    task_type: task.task_type_id ? lookups.types.get(task.task_type_id) || null : null,
    effort_level: task.effort_level_id ? lookups.efforts.get(task.effort_level_id) || null : null,
    location_context: task.location_context_id
      ? lookups.locations.get(task.location_context_id) || null
      : null,
    assignee: task.assigned_to ? lookups.users.get(task.assigned_to) || null : null,
    creator: task.created_by ? lookups.users.get(task.created_by) || null : null,
    // Enrich tags array: each tag_tags entry gets its config.tags data
    tags: task.tags
      ? task.tags.map((tt: any) => ({
          ...tt,
          tag: tt.tag_id ? lookups.tags.get(tt.tag_id) || null : null,
        }))
      : [],
  };
}

/**
 * Enrich an array of tasks
 */
export function enrichTasks(tasks: any[], lookups: ConfigLookups) {
  return tasks.map((t) => enrichTask(t, lookups));
}

/**
 * Enrich subtasks with config data (subtasks may not have all relations)
 */
export function enrichSubtask(subtask: any, lookups: ConfigLookups) {
  return {
    ...subtask,
    status: subtask.status_id ? lookups.statuses.get(subtask.status_id) || null : null,
    priority: subtask.priority_id ? lookups.priorities.get(subtask.priority_id) || null : null,
    task_type: subtask.task_type_id ? lookups.types.get(subtask.task_type_id) || null : null,
    effort_level: subtask.effort_level_id
      ? lookups.efforts.get(subtask.effort_level_id) || null
      : null,
    location_context: subtask.location_context_id
      ? lookups.locations.get(subtask.location_context_id) || null
      : null,
    tags: subtask.tags
      ? subtask.tags.map((tt: any) => ({
          ...tt,
          tag: tt.tag_id ? lookups.tags.get(tt.tag_id) || null : null,
        }))
      : [],
  };
}

/**
 * Enrich an array of subtasks
 */
export function enrichSubtasks(subtasks: any[], lookups: ConfigLookups) {
  return subtasks.map((st) => enrichSubtask(st, lookups));
}

/**
 * Enrich tag objects returned from task_tags queries
 * When fetching task_tags with tag data, resolve the tag_id to full tag objects
 */
export function enrichTagAssociations(tagAssociations: any[], lookups: ConfigLookups) {
  return tagAssociations.map((ta) => ({
    ...ta,
    tag: ta.tag_id ? lookups.tags.get(ta.tag_id) || null : null,
  }));
}
