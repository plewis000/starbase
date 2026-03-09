import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";
import { parseBody } from "@/lib/schemas";

const completionSchema = z.object({
  completed_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
  note: z.string().max(1000).nullish().transform((v) => v ?? null),
  mood: z
    .enum(["great", "good", "neutral", "tough", "terrible"])
    .optional(),
  value: z.number().min(0).max(1000000).optional(),
});

// =============================================================
// GET /api/tasks/:id/completions — List completion history
// Reads from the recurrence chain (completed task instances).
// =============================================================
export const GET = withAuth(async (_request, { supabase, ctx }, params) => {
  const taskId = params?.id;
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const hasAccess = await verifyTaskHouseholdAccess(supabase, taskId!, memberIds);
  if (!hasAccess) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { data: task } = await platform(supabase)
    .from("tasks")
    .select("id, recurrence_source_id")
    .eq("id", taskId!)
    .single();

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const sourceId = task.recurrence_source_id || task.id;

  // Get completion history from recurrence chain
  const { data: completedInstances, error } = await platform(supabase)
    .from("tasks")
    .select("id, due_date, completed_at, completion_note, completion_mood")
    .or(`id.eq.${sourceId},recurrence_source_id.eq.${sourceId}`)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Also fetch legacy task_completions for backward compat
  const { data: legacyCompletions } = await platform(supabase)
    .from("task_completions")
    .select("*")
    .or(`task_id.eq.${taskId},recurrence_source_id.eq.${sourceId}`)
    .order("completed_date", { ascending: false });

  return NextResponse.json({
    completions: completedInstances || [],
    legacy_completions: legacyCompletions || [],
  });
});

// =============================================================
// POST /api/tasks/:id/completions — Record a completion note/mood
// This is now an enrichment endpoint only. The actual completion
// happens via PATCH on the task (setting completed_at).
// =============================================================
export const POST = withAuth(async (request, { supabase, user, ctx }, params) => {
  const taskId = params?.id;
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  const hasAccess = await verifyTaskHouseholdAccess(supabase, taskId!, memberIds);
  if (!hasAccess) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const parsed = await parseBody(request, completionSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { note, mood } = parsed.data;

  // Store mood/note directly on the task
  const { data: updated, error } = await platform(supabase)
    .from("tasks")
    .update({
      completion_note: note || null,
      completion_mood: mood || null,
    })
    .eq("id", taskId!)
    .select("id, completion_note, completion_mood")
    .single();

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ task: updated }, { status: 200 });
});
