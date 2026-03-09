import { SupabaseClient } from "@supabase/supabase-js";
import { platform, household } from "@/lib/supabase/schemas";

type EntityType = "task" | "habit" | "goal" | "shopping_item";

interface EntityLink {
  id: string;
  source_type: EntityType;
  source_id: string;
  target_type: EntityType;
  target_id: string;
  link_type: string;
  sync_completion: boolean;
}

/**
 * Get all entities linked to a given entity (from both directions).
 */
export async function getLinkedEntities(
  supabase: SupabaseClient,
  entityType: EntityType,
  entityId: string
): Promise<EntityLink[]> {
  const [asSource, asTarget] = await Promise.all([
    platform(supabase)
      .from("entity_links")
      .select("*")
      .eq("source_type", entityType)
      .eq("source_id", entityId),
    platform(supabase)
      .from("entity_links")
      .select("*")
      .eq("target_type", entityType)
      .eq("target_id", entityId),
  ]);

  const seen = new Set<string>();
  return [...(asSource.data || []), ...(asTarget.data || [])].filter((link) => {
    if (seen.has(link.id)) return false;
    seen.add(link.id);
    return true;
  });
}

/**
 * Sync completion status to linked entities.
 * Call this when an entity is marked as complete.
 *
 * @param supabase - Authenticated client (session or service role)
 * @param entityType - The type of entity that was just completed
 * @param entityId - The ID of the entity that was just completed
 * @param userId - Who completed it (for audit trails)
 */
export async function syncCompletion(
  supabase: SupabaseClient,
  entityType: EntityType,
  entityId: string,
  userId: string
): Promise<{ synced: number; errors: string[] }> {
  const links = await getLinkedEntities(supabase, entityType, entityId);
  const syncLinks = links.filter((l) => l.sync_completion);

  let synced = 0;
  const errors: string[] = [];

  for (const link of syncLinks) {
    // Determine which side is the "other" entity
    const otherType =
      link.source_type === entityType && link.source_id === entityId
        ? link.target_type
        : link.source_type;
    const otherId =
      link.source_type === entityType && link.source_id === entityId
        ? link.target_id
        : link.source_id;

    try {
      await completeEntity(supabase, otherType, otherId, userId);
      synced++;
    } catch (err) {
      errors.push(`Failed to sync ${otherType}:${otherId}: ${err}`);
    }
  }

  return { synced, errors };
}

/**
 * Mark an entity as complete based on its type.
 * Each entity type has its own completion mechanism.
 */
async function completeEntity(
  supabase: SupabaseClient,
  entityType: EntityType,
  entityId: string,
  userId: string
): Promise<void> {
  const now = new Date().toISOString();

  switch (entityType) {
    case "task": {
      // Find the "Done" status ID
      const { data: statuses } = await supabase
        .schema("config")
        .from("task_statuses")
        .select("id")
        .ilike("name", "%done%")
        .limit(1)
        .single();

      if (statuses?.id) {
        await platform(supabase)
          .from("tasks")
          .update({ status_id: statuses.id, completed_at: now })
          .eq("id", entityId);
      }
      break;
    }

    case "shopping_item": {
      await household(supabase)
        .from("shopping_items")
        .update({ checked: true, checked_at: now, checked_by: userId })
        .eq("id", entityId);
      break;
    }

    case "habit": {
      // Habits are tasks with is_habit=true, completed via task_completions
      const today = new Date().toISOString().split("T")[0];
      await platform(supabase)
        .from("task_completions")
        .upsert(
          {
            task_id: entityId,
            completed_by: userId,
            completed_date: today,
            completed_at: new Date().toISOString(),
            source: "entity_link_sync",
          },
          { onConflict: "task_id,completed_by,completed_date" }
        );
      break;
    }

    case "goal": {
      // Goals don't auto-complete from links — they track progress.
      // A linked task completing contributes to goal progress, which is
      // recalculated by the existing goal-progress system.
      break;
    }
  }
}
