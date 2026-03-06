import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { logActivity } from "@/lib/activity-log";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// =============================================================
// PATCH /api/tasks/:taskId/comments/:commentId — Edit comment
// =============================================================
export const PATCH = withAuth(async (request, { supabase, user, ctx }, params) => {
  const taskId = params?.id;
  const commentId = params?.commentId;

  // Verify task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, taskId!, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { body: commentBody } = body;

  if (
    !commentBody ||
    typeof commentBody !== "string" ||
    commentBody.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "Comment body is required" },
      { status: 400 }
    );
  }

  // Only the author can edit their comment
  const { data: comment, error } = await platform(supabase)
    .from("task_comments")
    .update({
      body: commentBody.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", commentId!)
    .eq("task_id", taskId!)
    .eq("user_id", user.id) // Author only
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: "Comment not found or not authorized" },
        { status: 404 }
      );
    }
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: taskId!,
    action: "comment_edited",
    performed_by: user.id,
    metadata: { comment_id: commentId },
  });

  return NextResponse.json({ comment });
});

// =============================================================
// DELETE /api/tasks/:taskId/comments/:commentId — Delete comment
// =============================================================
export const DELETE = withAuth(async (_request, { supabase, user, ctx }, params) => {
  const taskId = params?.id;
  const commentId = params?.commentId;

  // Verify task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, taskId!, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Only the author can delete their comment
  const { data: existing } = await platform(supabase)
    .from("task_comments")
    .select("id")
    .eq("id", commentId!)
    .eq("user_id", user.id)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: "Comment not found or not authorized" },
      { status: 404 }
    );
  }

  const { error } = await platform(supabase)
    .from("task_comments")
    .delete()
    .eq("id", commentId!);

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: taskId!,
    action: "comment_deleted",
    performed_by: user.id,
    metadata: { comment_id: commentId },
  });

  return NextResponse.json({ success: true });
});
