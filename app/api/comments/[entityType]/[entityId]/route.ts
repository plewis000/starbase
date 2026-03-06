import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";
import { parseMentions, persistMentions } from "@/lib/mention-parser";
import { notifyEntity, ensureWatching, getUserDisplayName } from "@/lib/notify";
import { isValidUUID, validateEnum } from "@/lib/validation";
import { createCommentSchema, parseBody } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

const VALID_ENTITY_TYPES = ["task", "goal", "habit"] as const;

// Helper: enrich comments with author info from platform.users
async function enrichCommentsWithAuthors(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  comments: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  const userIds = [...new Set(comments.map((c) => c.user_id as string).filter(Boolean))];
  if (userIds.length === 0) return comments;

  const { data: users } = await platform(supabase)
    .from("users")
    .select("id, display_name, full_name, email, avatar_url")
    .in("id", userIds);

  const userMap = new Map((users || []).map((u) => [u.id, u]));

  return comments.map((c) => ({
    ...c,
    author: userMap.get(c.user_id as string) || null,
  }));
}

// ---- GET: List comments for an entity (with threading) ----

export const GET = withAuth(async (request: NextRequest, { supabase, user }, params) => {
  const entityType = params?.entityType;
  const entityId = params?.entityId;

  // Validate entity type
  const etCheck = validateEnum(entityType, "entityType", VALID_ENTITY_TYPES);
  if (!etCheck.valid) return NextResponse.json({ error: etCheck.error }, { status: 400 });
  if (!isValidUUID(entityId)) return NextResponse.json({ error: "Invalid entity ID" }, { status: 400 });

  const searchParams = request.nextUrl.searchParams;
  const flat = searchParams.get("flat") === "true"; // flat list vs threaded

  let query = platform(supabase)
    .from("comments")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  if (!flat) {
    // Top-level comments only (threads loaded via parent_id)
    query = query.is("parent_id", null);
  }

  const { data: rawComments, error } = await query;

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  // If threaded mode, also fetch replies
  let replies: Record<string, unknown>[] = [];
  if (!flat && rawComments && rawComments.length > 0) {
    const parentIds = rawComments.map((c) => c.id);
    const { data: replyData } = await platform(supabase)
      .from("comments")
      .select("*")
      .in("parent_id", parentIds)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });
    replies = (replyData || []) as Record<string, unknown>[];
  }

  // Enrich all comments with author data
  const allComments = [...(rawComments || []), ...replies] as Record<string, unknown>[];
  const enriched = await enrichCommentsWithAuthors(supabase, allComments);

  // Fetch reaction counts for all comments
  const commentIds = allComments.map((c) => c.id as string);
  let reactionsByComment = new Map<string, Record<string, number>>();
  if (commentIds.length > 0) {
    const { data: reactions } = await platform(supabase)
      .from("reactions")
      .select("comment_id, emoji, user_id")
      .in("comment_id", commentIds);

    if (reactions) {
      for (const r of reactions) {
        const existing = reactionsByComment.get(r.comment_id) || {};
        existing[r.emoji] = (existing[r.emoji] || 0) + 1;
        reactionsByComment.set(r.comment_id, existing);
      }
    }
  }

  // Build threaded response
  if (!flat) {
    const replyMap = new Map<string, unknown[]>();
    for (const r of enriched.filter((c) => c.parent_id)) {
      const pid = r.parent_id as string;
      if (!replyMap.has(pid)) replyMap.set(pid, []);
      replyMap.get(pid)!.push({
        ...r,
        reactions: reactionsByComment.get(r.id as string) || {},
      });
    }

    const threaded = enriched
      .filter((c) => !c.parent_id)
      .map((c) => ({
        ...c,
        reactions: reactionsByComment.get(c.id as string) || {},
        replies: replyMap.get(c.id as string) || [],
        reply_count: (replyMap.get(c.id as string) || []).length,
      }));

    return NextResponse.json({ comments: threaded });
  }

  // Flat response
  const flatComments = enriched.map((c) => ({
    ...c,
    reactions: reactionsByComment.get(c.id as string) || {},
  }));

  return NextResponse.json({ comments: flatComments });
});

// ---- POST: Create a comment (with mention parsing) ----

export const POST = withAuth(async (request: NextRequest, { supabase, user }, params) => {
  const entityType = params?.entityType;
  const entityId = params?.entityId;

  const etCheck = validateEnum(entityType, "entityType", VALID_ENTITY_TYPES);
  if (!etCheck.valid) return NextResponse.json({ error: etCheck.error }, { status: 400 });
  if (!isValidUUID(entityId)) return NextResponse.json({ error: "Invalid entity ID" }, { status: 400 });

  const parsed = await parseBody(request, createCommentSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { content, parent_id } = parsed.data;

  // Validate parent_id if provided (must be a comment on same entity)
  if (parent_id) {
    const { data: parentComment } = await platform(supabase)
      .from("comments")
      .select("id, entity_type, entity_id")
      .eq("id", parent_id)
      .single();

    if (!parentComment) {
      return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
    }
    if (parentComment.entity_type !== entityType || parentComment.entity_id !== entityId) {
      return NextResponse.json({ error: "Parent comment belongs to a different entity" }, { status: 400 });
    }
  }

  // Insert comment
  const { data: comment, error } = await platform(supabase)
    .from("comments")
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      user_id: user.id,
      body: content,
      parent_id: parent_id || null,
      metadata: null,
    })
    .select("*")
    .single();

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  // Parse mentions and persist
  const mentionResult = await parseMentions(supabase, content);
  if (mentionResult.resolvedUserIds.length > 0) {
    await persistMentions(
      supabase,
      comment.id,
      entityType,
      entityId,
      mentionResult.resolvedUserIds
    );
  }

  // Auto-watch: commenter becomes a watcher
  await ensureWatching(supabase, entityType, entityId, user.id).catch(console.error);

  // Log activity
  await logActivity(supabase, {
    entity_type: entityType,
    entity_id: entityId,
    action: "commented",
    performed_by: user.id,
    metadata: { comment_id: comment.id, is_reply: !!parent_id },
  }).catch(console.error);

  // Get entity title for notifications
  let entityTitle = "an item";
  const entityTable = entityType === "task" ? "tasks" : entityType === "goal" ? "goals" : "habits";
  const { data: entity } = await platform(supabase)
    .from(entityTable)
    .select("title")
    .eq("id", entityId)
    .single();
  if (entity) entityTitle = entity.title;

  // Notify watchers + mentioned users (non-blocking)
  const actorName = await getUserDisplayName(supabase, user.id);
  const eventType = `${entityType}_commented` as const;
  notifyEntity(supabase, {
    entityType,
    entityId,
    event: eventType as any,
    actorUserId: user.id,
    title: `${actorName} commented on ${entityType}: ${entityTitle}`,
    body: content.length > 200 ? content.slice(0, 200) + "..." : content,
    mentionedUserIds: mentionResult.resolvedUserIds,
    metadata: { comment_id: comment.id },
  }).catch(console.error);

  // Enrich and return
  const enriched = await enrichCommentsWithAuthors(supabase, [comment as Record<string, unknown>]);

  return NextResponse.json({
    comment: {
      ...enriched[0],
      mentions: mentionResult.mentions,
      reactions: {},
    },
  }, { status: 201 });
});
