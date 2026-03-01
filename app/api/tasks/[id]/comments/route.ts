import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { notifyTaskCommented } from "@/lib/notify";
import { parseMentions, persistMentions } from "@/lib/mention-parser";
import { platform } from "@/lib/supabase/schemas";
import { getConfigLookups } from "@/lib/task-enrichment";
import { isValidUUID } from "@/lib/validation";
import { getHouseholdContext, getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// Helper to enrich comments with author data from platform.users
function enrichComments(comments: any[], lookups: { users: Map<string, any> }) {
  return comments.map((c) => ({
    ...c,
    author: c.user_id ? lookups.users.get(c.user_id) || null : null,
  }));
}

// =============================================================
// GET /api/tasks/:id/comments — List comments (threaded or flat)
// =============================================================
export async function GET(
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
  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household found" }, { status: 404 });
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const flat = request.nextUrl.searchParams.get("flat") === "true";

  let query = platform(supabase)
    .from("comments")
    .select("*")
    .eq("entity_type", "task")
    .eq("entity_id", id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  if (!flat) {
    // Top-level comments only; replies fetched separately
    query = query.is("parent_id", null);
  }

  const { data: rawComments, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lookups = await getConfigLookups(supabase);

  if (!flat && rawComments && rawComments.length > 0) {
    // Fetch replies for all top-level comments
    const parentIds = rawComments.map((c: any) => c.id);
    const { data: rawReplies } = await platform(supabase)
      .from("comments")
      .select("*")
      .in("parent_id", parentIds)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    const enrichedAll = enrichComments(
      [...rawComments, ...(rawReplies || [])],
      lookups
    );

    // Build threaded structure
    const replyMap = new Map<string, any[]>();
    for (const c of enrichedAll) {
      if (c.parent_id) {
        if (!replyMap.has(c.parent_id)) replyMap.set(c.parent_id, []);
        replyMap.get(c.parent_id)!.push(c);
      }
    }

    const threaded = enrichedAll
      .filter((c: any) => !c.parent_id)
      .map((c: any) => ({
        ...c,
        replies: replyMap.get(c.id) || [],
        reply_count: (replyMap.get(c.id) || []).length,
      }));

    return NextResponse.json({ comments: threaded });
  }

  const comments = enrichComments(rawComments || [], lookups);
  return NextResponse.json({ comments });
}

// =============================================================
// POST /api/tasks/:id/comments — Add a comment (with threading + mentions)
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

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { body: commentBody, parent_id } = body;

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

  // Validate parent_id if provided (must be a comment on same task)
  if (parent_id) {
    if (!isValidUUID(parent_id)) {
      return NextResponse.json({ error: "parent_id must be a valid UUID" }, { status: 400 });
    }
    const { data: parentComment } = await platform(supabase)
      .from("comments")
      .select("id")
      .eq("id", parent_id)
      .eq("entity_type", "task")
      .eq("entity_id", id)
      .eq("is_deleted", false)
      .single();

    if (!parentComment) {
      return NextResponse.json({ error: "Parent comment not found on this task" }, { status: 404 });
    }
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

  const trimmedBody = commentBody.trim();

  const { data: rawComment, error } = await platform(supabase)
    .from("comments")
    .insert({
      entity_type: "task",
      entity_id: id,
      user_id: user.id,
      body: trimmedBody,
      parent_id: parent_id || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: id,
    action: parent_id ? "replied" : "commented",
    performed_by: user.id,
    metadata: { comment_id: rawComment.id, parent_id: parent_id || undefined },
  });

  // Update task's last_touched_at
  await platform(supabase)
    .from("tasks")
    .update({ last_touched_at: new Date().toISOString() })
    .eq("id", id);

  // Parse @mentions and persist them
  let mentions: any[] = [];
  let mentionedUserIds: string[] = [];
  try {
    const mentionResult = await parseMentions(supabase, trimmedBody);
    mentions = mentionResult.mentions || [];
    mentionedUserIds = mentionResult.resolvedUserIds || [];

    // Persist mentions to database
    if (mentionedUserIds.length > 0) {
      await persistMentions(supabase, rawComment.id, "task", id, mentionedUserIds);
    }
  } catch (err) {
    console.error("Mention parsing error:", err);
  }

  // Enrich with author data
  const lookups = await getConfigLookups(supabase);
  const comment = enrichComments([rawComment], lookups)[0];

  // Notify all involved users (non-blocking)
  notifyTaskCommented(supabase, id, task.title, user.id, trimmedBody).catch(
    (err) => console.error("Comment notification error:", err)
  );

  // Notify mentioned users (non-blocking)
  if (mentionedUserIds.length > 0) {
    mentionedUserIds.forEach(userId => {
      // Don't notify the commenter about their own mentions
      if (userId !== user.id) {
        // You would implement notifyUserMentioned function
        // notifyUserMentioned(supabase, userId, id, task.title, user.id, trimmedBody).catch(
        //   (err) => console.error("Mention notification error:", err)
        // );
      }
    });
  }

  return NextResponse.json({
    comment: { ...comment, mentions },
  }, { status: 201 });
}
