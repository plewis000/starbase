import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";
import { parseMentions, persistMentions } from "@/lib/mention-parser";
import { validateRequiredString, safeParseBody, isValidUUID, validateEnum } from "@/lib/validation";

const VALID_ENTITY_TYPES = ["task", "goal", "habit"] as const;

// ---- GET: Single comment with edit history ----

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string; commentId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { commentId } = await params;
  if (!isValidUUID(commentId)) return NextResponse.json({ error: "Invalid comment ID" }, { status: 400 });

  const { data: comment, error } = await platform(supabase)
    .from("comments")
    .select("*")
    .eq("id", commentId)
    .single();

  if (error || !comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  // Fetch edit history
  const { data: edits } = await platform(supabase)
    .from("comment_edits")
    .select("*")
    .eq("comment_id", commentId)
    .order("edited_at", { ascending: false });

  // Fetch reactions
  const { data: reactions } = await platform(supabase)
    .from("reactions")
    .select("emoji, user_id")
    .eq("comment_id", commentId);

  const reactionCounts: Record<string, number> = {};
  const userReactions: string[] = [];
  if (reactions) {
    for (const r of reactions) {
      reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
      if (r.user_id === user.id) userReactions.push(r.emoji);
    }
  }

  // Fetch mentions
  const { data: mentions } = await platform(supabase)
    .from("mentions")
    .select("mentioned_user_id")
    .eq("comment_id", commentId);

  return NextResponse.json({
    comment: {
      ...comment,
      edit_history: edits || [],
      reactions: reactionCounts,
      user_reactions: userReactions,
      mention_user_ids: (mentions || []).map((m) => m.mentioned_user_id),
    },
  });
}

// ---- PATCH: Edit comment body or toggle pin ----

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string; commentId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entityType, entityId, commentId } = await params;
  if (!isValidUUID(commentId)) return NextResponse.json({ error: "Invalid comment ID" }, { status: 400 });

  const parsed = await safeParseBody(request);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { body: newBody, action } = parsed.body;

  // Fetch existing comment
  const { data: existing } = await platform(supabase)
    .from("comments")
    .select("*")
    .eq("id", commentId)
    .single();

  if (!existing) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  // Pin/unpin action — only comment author or entity owner can pin
  if (action === "pin" || action === "unpin") {
    let canPin = existing.user_id === user.id;

    // Also allow the entity owner to pin (goals/habits are personal)
    if (!canPin && (entityType === "goal" || entityType === "habit")) {
      const entityTable = entityType === "goal" ? "goals" : "habits";
      const { data: entity } = await platform(supabase)
        .from(entityTable)
        .select("owner_id")
        .eq("id", entityId)
        .single();
      if (entity && entity.owner_id === user.id) canPin = true;
    }
    // For tasks, allow creator or assignee to pin
    if (!canPin && entityType === "task") {
      const { data: task } = await platform(supabase)
        .from("tasks")
        .select("created_by, assigned_to")
        .eq("id", entityId)
        .single();
      if (task && (task.created_by === user.id || task.assigned_to === user.id)) canPin = true;
    }

    if (!canPin) {
      return NextResponse.json({ error: "You don't have permission to pin/unpin this comment" }, { status: 403 });
    }

    const { data: updated, error } = await platform(supabase)
      .from("comments")
      .update({ is_pinned: action === "pin" })
      .eq("id", commentId)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ comment: updated });
  }

  // Edit body — only comment author can edit
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
  }

  if (existing.is_deleted) {
    return NextResponse.json({ error: "Cannot edit a deleted comment" }, { status: 400 });
  }

  if (!newBody) {
    return NextResponse.json({ error: "body is required for editing" }, { status: 400 });
  }

  const bodyCheck = validateRequiredString(newBody, "body", 10000);
  if (!bodyCheck.valid) return NextResponse.json({ error: bodyCheck.error }, { status: 400 });

  // Save edit history
  await platform(supabase)
    .from("comment_edits")
    .insert({
      comment_id: commentId,
      previous_body: existing.body,
      edited_by: user.id,
    });

  // Update comment
  const { data: updated, error } = await platform(supabase)
    .from("comments")
    .update({
      body: bodyCheck.value,
      is_edited: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commentId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Re-parse mentions
  const mentionResult = await parseMentions(supabase, bodyCheck.value);

  // Delete old mentions and re-persist
  await platform(supabase).from("mentions").delete().eq("comment_id", commentId);
  if (mentionResult.resolvedUserIds.length > 0) {
    await persistMentions(supabase, commentId, entityType, entityId, mentionResult.resolvedUserIds);
  }

  await logActivity(supabase, {
    entity_type: entityType,
    entity_id: entityId,
    action: "comment_edited",
    performed_by: user.id,
    metadata: { comment_id: commentId },
  }).catch(console.error);

  return NextResponse.json({ comment: updated });
}

// ---- DELETE: Soft-delete a comment ----

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string; commentId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entityType, entityId, commentId } = await params;
  if (!isValidUUID(commentId)) return NextResponse.json({ error: "Invalid comment ID" }, { status: 400 });

  const { data: existing } = await platform(supabase)
    .from("comments")
    .select("user_id, is_deleted")
    .eq("id", commentId)
    .single();

  if (!existing) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
  }
  if (existing.is_deleted) {
    return NextResponse.json({ error: "Comment already deleted" }, { status: 400 });
  }

  // Soft delete
  const { error } = await platform(supabase)
    .from("comments")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      body: "[deleted]",
    })
    .eq("id", commentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(supabase, {
    entity_type: entityType,
    entity_id: entityId,
    action: "comment_deleted",
    performed_by: user.id,
    metadata: { comment_id: commentId },
  }).catch(console.error);

  return NextResponse.json({ success: true });
}
