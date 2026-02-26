import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { platform } from "@/lib/supabase/schemas";

// =============================================================
// DELETE /api/tasks/:taskId/dependencies/:depId — Remove dependency
// =============================================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; depId: string }> }
) {
  const { id: taskId, depId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await platform(supabase)
    .from("task_dependencies")
    .delete()
    .eq("id", depId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: taskId,
    action: "dependency_removed",
    performed_by: user.id,
    metadata: { dependency_id: depId },
  });

  return NextResponse.json({ success: true });
}
