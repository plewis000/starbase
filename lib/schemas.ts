/**
 * Zod schemas for API input validation.
 * Replaces manual validation calls with declarative schemas.
 */

import { z } from "zod";

// ---- Primitives ----

const uuid = z.string().uuid();
const optionalUuid = z.string().uuid().nullish().transform(v => v ?? null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").refine(
  (v) => { const d = new Date(v + "T00:00:00Z"); return !isNaN(d.getTime()) && d.toISOString().startsWith(v); },
  "Must be a valid date"
);
const optionalDate = date.nullish().transform(v => v ?? null);
const trimmedString = (max: number) => z.string().trim().min(1, "Cannot be empty").max(max);
const optionalTrimmedString = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null);
const uuidArray = z.array(z.string().uuid()).max(50).default([]);
const specificDays = z.array(z.number().int().min(0).max(6)).max(7).transform(v => [...new Set(v)]).nullish().transform(v => v ?? null);

// ---- Task Schemas ----

export const createTaskSchema = z.object({
  title: trimmedString(300),
  description: optionalTrimmedString(5000),
  status_id: optionalUuid,
  priority_id: optionalUuid,
  task_type_id: optionalUuid,
  assigned_to: optionalUuid,
  owner_ids: z.array(z.string().uuid()).max(20).optional(),
  due_date: optionalDate,
  schedule_date: optionalDate,
  effort_level_id: optionalUuid,
  location_context_id: optionalUuid,
  recurrence_rule: optionalTrimmedString(500),
  parent_task_id: optionalUuid,
  domain_slugs: z.array(z.string().max(50)).max(10).optional(),
  tag_ids: uuidArray.optional(),
  checklist_items: z.array(z.string().max(500)).max(100).optional(),
});

export const updateTaskSchema = z.object({
  title: trimmedString(300).optional(),
  description: optionalTrimmedString(5000),
  status_id: optionalUuid,
  priority_id: optionalUuid,
  task_type_id: optionalUuid,
  assigned_to: optionalUuid,
  owner_ids: z.array(z.string().uuid()).max(20).optional(),
  due_date: optionalDate,
  schedule_date: optionalDate,
  effort_level_id: optionalUuid,
  location_context_id: optionalUuid,
  recurrence_rule: optionalTrimmedString(500),
  parent_task_id: optionalUuid,
  completed_at: z.string().datetime().nullish().transform(v => v ?? null),
  sort_order: z.number().int().min(0).max(100000).optional(),
}).partial();

// ---- Habit Schemas ----

export const createHabitSchema = z.object({
  title: trimmedString(200),
  description: optionalTrimmedString(2000),
  category_id: optionalUuid,
  frequency_id: uuid,
  target_count: z.number().int().min(1).max(365).default(1),
  time_preference_id: optionalUuid,
  specific_days: specificDays,
  started_on: optionalDate,
  goal_ids: uuidArray.optional(),
});

export const updateHabitSchema = z.object({
  title: trimmedString(200).optional(),
  description: optionalTrimmedString(2000),
  category_id: optionalUuid,
  frequency_id: z.string().uuid().optional(),
  target_count: z.number().int().min(1).max(365).optional(),
  time_preference_id: optionalUuid,
  specific_days: specificDays,
  status: z.enum(["active", "paused", "retired"]).optional(),
}).partial();

export const habitCheckInSchema = z.object({
  note: optionalTrimmedString(1000),
  mood: z.number().int().min(1).max(5).optional(),
  value: z.number().min(0).max(1000000).optional(),
  check_date: date.optional(),
});

// ---- Goal Schemas ----

export const createGoalSchema = z.object({
  title: trimmedString(300),
  description: optionalTrimmedString(5000),
  category_id: optionalUuid,
  timeframe_id: optionalUuid,
  start_date: optionalDate,
  target_date: optionalDate,
  progress_type: z.enum(["manual", "milestone", "habit_driven", "task_driven"]).default("manual"),
  target_value: z.number().min(0).max(1000000).nullish().transform(v => v ?? null),
  unit: z.string().max(50).nullish().transform(v => v ?? null),
  parent_goal_id: optionalUuid,
  milestones: z.array(z.object({
    title: trimmedString(300),
    target_date: optionalDate,
  })).max(50).optional(),
  habit_ids: uuidArray.optional(),
  task_ids: uuidArray.optional(),
});

export const updateGoalSchema = z.object({
  title: trimmedString(300).optional(),
  description: optionalTrimmedString(5000),
  category_id: optionalUuid,
  timeframe_id: optionalUuid,
  start_date: optionalDate,
  target_date: optionalDate,
  progress_type: z.enum(["manual", "milestone", "habit_driven", "task_driven"]).optional(),
  progress_value: z.number().min(0).max(1000000).optional(),
  target_value: z.number().min(0).max(1000000).optional(),
  unit: z.string().max(50).nullish().transform(v => v ?? null),
  status: z.enum(["active", "completed", "paused", "abandoned"]).optional(),
}).partial();

// ---- Shopping Schemas ----

export const createShoppingListSchema = z.object({
  name: trimmedString(100),
  is_default: z.boolean().default(false),
});

export const createShoppingItemSchema = z.object({
  name: trimmedString(200),
  quantity: z.number().min(0).max(10000).optional(),
  unit: z.string().max(50).nullish().transform(v => v ?? null),
  category: z.string().max(100).nullish().transform(v => v ?? null),
  is_staple: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(10000).optional(),
});

export const updateShoppingItemSchema = z.object({
  name: trimmedString(200).optional(),
  quantity: z.number().min(0).max(10000).optional(),
  unit: z.string().max(50).nullish().transform(v => v ?? null),
  category: z.string().max(100).nullish().transform(v => v ?? null),
  checked: z.boolean().optional(),
  is_staple: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
}).partial();

// ---- Comment Schemas ----

export const createCommentSchema = z.object({
  content: trimmedString(5000),
  parent_id: optionalUuid,
  mentions: z.array(z.string().uuid()).max(20).optional(),
});

// ---- Finance Schemas ----

export const updateTransactionSchema = z.object({
  category_id: z.string().uuid().nullish().transform(v => v ?? undefined),
  notes: optionalTrimmedString(1000),
  reviewed: z.boolean().optional(),
  excluded: z.boolean().optional(),
  merchant_name: optionalTrimmedString(200),
  description: optionalTrimmedString(1000),
}).partial();

export const createBudgetSchema = z.object({
  category_id: uuid,
  monthly_amount: z.number().min(0.01).max(10000000),
  alerts: z.array(z.number().int().min(1).max(100)).max(10).optional(),
});

export const createMerchantRuleSchema = z.object({
  merchant_pattern: trimmedString(200),
  category_id: uuid,
});

export const splitTransactionSchema = z.object({
  splits: z.array(z.object({
    amount: z.number().min(0.01).max(10000000),
    category_id: uuid,
    description: optionalTrimmedString(500),
  })).min(2).max(20),
});

// ---- Notification Schemas ----

export const updateNotificationPrefsSchema = z.record(
  z.string(),
  z.object({
    in_app: z.boolean().optional(),
    discord: z.boolean().optional(),
    email: z.boolean().optional(),
  })
);

// ---- Bulk Operations ----

export const bulkStatusUpdateSchema = z.object({
  task_ids: z.array(z.string().uuid()).min(1).max(100),
  status_id: uuid,
});

export const bulkTagUpdateSchema = z.object({
  task_ids: z.array(z.string().uuid()).min(1).max(100),
  tag_ids: z.array(z.string().uuid()).max(50),
  action: z.enum(["add", "remove", "set"]),
});

// ---- Feedback Schemas ----

export const createFeedbackSchema = z.object({
  type: z.enum(["bug", "wish", "praise"]),
  content: trimmedString(5000),
  source: z.enum(["web", "discord", "api"]).default("web"),
});

// ---- Entity Link Schemas ----

export const createEntityLinkSchema = z.object({
  source_type: z.enum(["task", "habit", "goal", "shopping_item"]),
  source_id: uuid,
  target_type: z.enum(["task", "habit", "goal", "shopping_item"]),
  target_id: uuid,
  link_type: z.enum(["derived_from", "tracks", "syncs_with"]),
  sync_completion: z.boolean().default(false),
}).refine(
  (d) => !(d.source_type === d.target_type && d.source_id === d.target_id),
  { message: "Cannot link an entity to itself" }
);

// ---- Pagination (for query params) ----

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ---- Helper: parse body with Zod ----

export async function parseBody<T>(request: Request, schema: z.ZodSchema<T>): Promise<
  { ok: true; data: T } | { ok: false; error: string; status: 400 }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "Invalid JSON in request body", status: 400 };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const firstError = result.error.issues[0];
    const path = firstError.path.length > 0 ? `${firstError.path.join(".")}: ` : "";
    return { ok: false, error: `${path}${firstError.message}`, status: 400 };
  }

  return { ok: true, data: result.data };
}
