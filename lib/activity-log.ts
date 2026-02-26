import { SupabaseClient } from "@supabase/supabase-js";
import { platform } from "@/lib/supabase/schemas";

interface ActivityLogEntry {
  entity_type: string;
  entity_id: string;
  action: string;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  performed_by: string;
  metadata?: Record<string, unknown> | null;
}

export async function logActivity(
  supabase: SupabaseClient,
  entry: ActivityLogEntry
) {
  const { error } = await platform(supabase)
    .from("activity_log")
    .insert({
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      action: entry.action,
      field_name: entry.field_name || null,
      old_value: entry.old_value || null,
      new_value: entry.new_value || null,
      performed_by: entry.performed_by,
      metadata: entry.metadata || null,
    });

  if (error) {
    console.error("Activity log error:", error);
  }
}

export async function logFieldChanges(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string,
  userId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
) {
  const changes: Array<{
    entity_type: string;
    entity_id: string;
    action: string;
    field_name: string;
    old_value: string | null;
    new_value: string | null;
    performed_by: string;
  }> = [];

  for (const [key, newVal] of Object.entries(newValues)) {
    if (newVal !== undefined && oldValues[key] !== newVal) {
      changes.push({
        entity_type: entityType,
        entity_id: entityId,
        action: "updated",
        field_name: key,
        old_value: oldValues[key] != null ? String(oldValues[key]) : null,
        new_value: newVal != null ? String(newVal) : null,
        performed_by: userId,
      });
    }
  }

  if (changes.length > 0) {
    const { error } = await platform(supabase)
      .from("activity_log")
      .insert(changes);

    if (error) {
      console.error("Activity log batch error:", error);
    }
  }

  return changes.length;
}
