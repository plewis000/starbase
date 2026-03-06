import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { logActivity } from "@/lib/activity-log";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// =============================================================
// DELETE /api/tasks/:taskId/dependencies/:depId — Remove dependency
// =============================================================
export const DELETE = withAuth(async (_request, { supabase, user, ctx }, params) => {
  const taskId = params?.id;
  const depId = params?.depId;

  // Verify task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, taskId!, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { error } = await platform(supabase)
    .from("task_dependencies")
    .delete()
    .eq("id", depId!)
    .eq("task_id", taskId!);

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: taskId!,
    action: "dependency_removed",
    performed_by: user.id,
    metadata: { dependency_id: depId },
  });

  return NextResponse.json({ success: true });
});
