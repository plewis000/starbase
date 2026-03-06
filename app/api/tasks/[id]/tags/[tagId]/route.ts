import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { logActivity } from "@/lib/activity-log";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// =============================================================
// DELETE /api/tasks/:taskId/tags/:tagId — Remove tag from task
// =============================================================
export const DELETE = withAuth(async (_request, { supabase, user, ctx }, params) => {
  const taskId = params?.id;
  const tagId = params?.tagId;

  // Verify task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, taskId!, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { error } = await platform(supabase)
    .from("task_tags")
    .delete()
    .eq("task_id", taskId!)
    .eq("tag_id", tagId!);

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: taskId!,
    action: "tag_removed",
    performed_by: user.id,
    metadata: { tag_id: tagId },
  });

  return NextResponse.json({ success: true });
});
