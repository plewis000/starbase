import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { platform } from "@/lib/supabase/schemas";

// =============================================================
// PATCH /api/tasks/:taskId/comments/:commentId — Edit comment
// =============================================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id: taskId, commentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
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
    .eq("id", commentId)
    .eq("task_id", taskId)
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: taskId,
    action: "comment_edited",
    performed_by: user.id,
    metadata: { comment_id: commentId },
  });

  return NextResponse.json({ comment });
}

// =============================================================
// DELETE /api/tasks/:taskId/comments/:commentId — Delete comment
// =============================================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id: taskId, commentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only the author can delete their comment
  const { data: existing } = await platform(supabase)
    .from("task_comments")
    .select("id")
    .eq("id", commentId)
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
    .eq("id", commentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: taskId,
    action: "comment_deleted",
    performed_by: user.id,
    metadata: { comment_id: commentId },
  });

  return NextResponse.json({ success: true });
}
