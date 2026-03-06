import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// =============================================================
// POST /api/tasks/bulk/tags — Bulk add/remove tags
// Body: { task_ids: string[], action: "add" | "remove", tag_id: string }
// =============================================================
export const POST = withAuth(async (request, { supabase, user, ctx }) => {
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);

  const body = await request.json();
  const { task_ids, action, tag_id } = body;

  if (!Array.isArray(task_ids) || task_ids.length === 0) {
    return NextResponse.json({ error: "task_ids required" }, { status: 400 });
  }

  if (!["add", "remove"].includes(action)) {
    return NextResponse.json({ error: "action must be 'add' or 'remove'" }, { status: 400 });
  }

  if (!tag_id) {
    return NextResponse.json({ error: "tag_id required" }, { status: 400 });
  }

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
