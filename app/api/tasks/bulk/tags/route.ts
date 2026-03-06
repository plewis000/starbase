import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";
import { parseBody } from "@/lib/schemas";
import { z } from "zod";

// =============================================================
// POST /api/tasks/bulk/tags — Bulk add/remove tags
// Body: { task_ids: string[], action: "add" | "remove", tag_id: string }
// =============================================================
const bulkTagSchema = z.object({
  task_ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(["add", "remove"]),
  tag_id: z.string().uuid(),
});

export const POST = withAuth(async (request, { supabase, user, ctx }) => {
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  const parsed = await parseBody(request, bulkTagSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { task_ids, action, tag_id } = parsed.data;

  // Verify all tasks belong to household
  for (const taskId of task_ids) {
    if (!(await verifyTaskHouseholdAccess(supabase, taskId, memberIds))) {
      return NextResponse.json({ error: `Task ${taskId} not found` }, { status: 404 });
    }
  }

  if (action === "add") {
    const rows = task_ids.map((task_id: string) => ({ task_id, tag_id }));
    const { error } = await platform(supabase)
      .from("task_tags")
      .upsert(rows, { onConflict: "task_id,tag_id", ignoreDuplicates: true });

    if (error) {
      console.error("Bulk tag add error:", error.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  } else {
    const { error } = await platform(supabase)
      .from("task_tags")
      .delete()
      .in("task_id", task_ids)
      .eq("tag_id", tag_id);

    if (error) {
      console.error("Bulk tag remove error:", error.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, updated: task_ids.length });
});
