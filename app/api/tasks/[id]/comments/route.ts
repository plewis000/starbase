import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { notifyTaskCommented } from "@/lib/notify";
import { platform } from "@/lib/supabase/schemas";
import { getConfigLookups } from "@/lib/task-enrichment";
import { getHouseholdContext, getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// Helper to enrich comments with author data from platform.users
function enrichComments(comments: any[], lookups: { users: Map<string, any> }) {
  return comments.map((c) => ({
    ...c,
    author: c.user_id ? lookups.users.get(c.user_id) || null : null,
  }));
}

// =============================================================
// GET /api/tasks/:id/comments — List comments chronologically
// =============================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify task belongs to user's household
  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household found" }, { status: 404 });
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { data: rawComments, error } = await platform(supabase)
    .from("task_comments")
    .select("*")
    .eq("task_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lookups = await getConfigLookups(supabase);
  const comments = enrichComments(rawComments || [], lookups);

  return NextResponse.json({ comments });
}

// =============================================================
// POST /api/tasks/:id/comments — Add a comment
// =============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify task belongs to user's household
  const ctxPost = await getHouseholdContext(supabase, user.id);
  if (!ctxPost) return NextResponse.json({ error: "No household found" }, { status: 404 });
  const memberIdsPost = await getHouseholdMemberIds(supabase, ctxPost.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id, memberIdsPost))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
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

  // Get task title for notifications
  const { data: task } = await platform(supabase)
    .from("tasks")
    .select("id, title")
    .eq("id", id)
    .single();

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { data: rawComment, error } = await platform(supabase)
    .from("task_comments")
    .insert({
      task_id: id,
      user_id: user.id,
      body: commentBody.trim(),
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: id,
    action: "commented",
    performed_by: user.id,
    metadata: { comment_id: rawComment.id },
  });

  // Update task's last_touched_at
  await platform(supabase)
    .from("tasks")
    .update({ last_touched_at: new Date().toISOString() })
    .eq("id", id);

  // Enrich with author data
  const lookups = await getConfigLookups(supabase);
  const comment = enrichComments([rawComment], lookups)[0];

  // Notify all involved users (non-blocking)
  notifyTaskCommented(supabase, id, task.title, user.id, commentBody.trim()).catch(
    (err) => console.error("Comment notification error:", err)
  );

  return NextResponse.json({ comment }, { status: 201 });
}
