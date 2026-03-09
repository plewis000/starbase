/**
 * Infer recurrence mode from context.
 * Most users shouldn't need to think about this —
 * habits default to flexible (from completion), everything else defaults to fixed (from due_date).
 */
export function inferRecurrenceMode(context: {
  is_habit?: boolean;
  explicit_mode?: "fixed" | "flexible";
}): "fixed" | "flexible" {
  if (context.explicit_mode) return context.explicit_mode;
  if (context.is_habit) return "flexible";
  return "fixed";
}
