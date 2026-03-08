// ============================================================
// FILE: app/api/feedback/route.ts
// PURPOSE: Feedback submission + listing — frictionless input from any user
//          Zev classifies after submission. No priority required at submit time.
// PART OF: The Keep
// ============================================================

import { NextRequest, NextResponse, after } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import { triggerNotification } from "@/lib/notify";
import { sendMessageWithButtons, ZEV_COLOR, findChannelByName, CHANNELS } from "@/lib/discord";
import { validateEnum, validatePagination } from "@/lib/validation";
import { createFeedbackSchema, parseBody } from "@/lib/schemas";
import type { FeedbackType, FeedbackStatus, FeedbackSource } from "@/lib/types";

const VALID_TYPES: readonly FeedbackType[] = ["bug", "wish", "feedback", "question"] as const;
const VALID_STATUSES: readonly FeedbackStatus[] = ["new", "acknowledged", "planned", "in_progress", "done", "wont_fix"] as const;
const VALID_SOURCES: readonly FeedbackSource[] = ["chat", "discord", "web_form", "system"] as const;

// GET /api/feedback — list feedback with filters
export const GET = withUser(async (request: NextRequest, { supabase, user }) => {
  const ctx = await getHouseholdContext(supabase, user.id);
  const params = request.nextUrl.searchParams;

  let query = platform(supabase)
    .from("feedback")
    .select("*", { count: "exact" });

  // Scope to household or own submissions
  if (ctx) {
    query = query.or(`household_id.eq.${ctx.household_id},submitted_by.eq.${user.id}`);
  } else {
    query = query.eq("submitted_by", user.id);
  }

  // Filter by type
  const type = params.get("type");
  if (type && VALID_TYPES.includes(type as FeedbackType)) {
    query = query.eq("type", type);
  }

  // Filter by status
  const status = params.get("status");
  if (status && VALID_STATUSES.includes(status as FeedbackStatus)) {
    query = query.eq("status", status);
  } else if (!params.get("all")) {
    // Default: hide done/wont_fix unless ?all=true
    query = query.not("status", "in", '("done","wont_fix")');
  }

  // Filter by submitter
  const submittedBy = params.get("submitted_by");
  if (submittedBy) {
    query = query.eq("submitted_by", submittedBy);
  }

  // Sorting
  const sort = params.get("sort") === "priority" ? "priority" : "created_at";
  query = query.order(sort, { ascending: sort === "priority", nullsFirst: false });

  const { limit, offset } = validatePagination(params.get("limit"), params.get("offset"));
  query = query.range(offset, offset + limit - 1);

  const { data: feedback, error, count } = await query;

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Fetch vote counts for returned feedback
  let enrichedFeedback = feedback || [];
  if (enrichedFeedback.length > 0) {
    const feedbackIds = enrichedFeedback.map((f) => f.id);

    const { data: votes } = await platform(supabase)
      .from("feedback_votes")
      .select("feedback_id, user_id")
      .in("feedback_id", feedbackIds);

    const voteMap = new Map<string, { count: number; votedByMe: boolean }>();
    for (const v of (votes || [])) {
      const entry = voteMap.get(v.feedback_id) || { count: 0, votedByMe: false };
      entry.count++;
      if (v.user_id === user.id) entry.votedByMe = true;
      voteMap.set(v.feedback_id, entry);
    }

    enrichedFeedback = enrichedFeedback.map((f) => ({
      ...f,
      vote_count: voteMap.get(f.id)?.count || 0,
      voted_by_me: voteMap.get(f.id)?.votedByMe || false,
    }));
  }

  return NextResponse.json({ feedback: enrichedFeedback, total: count || 0 });
});

// POST /api/feedback — submit feedback (frictionless)
export const POST = withUser(async (request: NextRequest, { supabase, user }) => {
  const parsed = await parseBody(request, createFeedbackSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { type, content, source } = parsed.data;

  // Get household context (non-blocking — feedback works without a household)
  let householdId: string | null = null;
  try {
    const ctx = await getHouseholdContext(supabase, user.id);
    householdId = ctx?.household_id || null;
  } catch {
    // No household — that's fine
  }

  const insertPayload = {
    household_id: householdId,
    submitted_by: user.id,
    type,
    body: content,
    page_url: null,
    screenshot_url: null,
    source,
    conversation_id: null,
    tags: null,
  };

  const { data: feedbackItem, error } = await platform(supabase)
    .from("feedback")
    .insert(insertPayload)
    .select("id, type, body, status, created_at")
    .single();

  if (error) {
    console.error("[feedback] insert failed:", JSON.stringify({ message: error.message, details: error.details, hint: error.hint, code: error.code, payload: insertPayload }));
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Background work — auto-upvote, notifications, pipeline posting
  after(async () => {
    // Auto-upvote
    try {
      await platform(supabase)
        .from("feedback_votes")
        .insert({ feedback_id: feedbackItem.id, user_id: user.id });
    } catch { /* ignore */ }

    // Household notifications
    if (householdId) {
      try {
        const { data: members } = await platform(supabase)
          .from("household_members")
          .select("user_id")
          .eq("household_id", householdId)
          .neq("user_id", user.id);

        const typeEmoji: Record<string, string> = {
          bug: "🐛", wish: "⭐", feedback: "💬", question: "❓",
        };

        for (const member of (members || [])) {
          await triggerNotification(supabase, {
            recipientUserId: member.user_id,
            title: `${typeEmoji[type]} New ${type}: ${content.slice(0, 80)}`,
            body: content.length > 80 ? content.slice(0, 200) + "..." : content,
            event: "system",
            metadata: {
              feedback_id: feedbackItem.id,
              feedback_type: type,
              page_url: null,
            },
          });
        }
      } catch { /* ignore notification failures */ }
    }

    // Post to #feedback with Approve/Backlog/Won't Fix buttons
    const feedbackChannelId = await findChannelByName(CHANNELS.FEEDBACK);
    if (feedbackChannelId) {
      try {
        const typeEmoji: Record<string, string> = {
          bug: "🐛", wish: "⭐", feedback: "💬", question: "❓",
        };
        const messageId = await sendMessageWithButtons(feedbackChannelId, {
          embeds: [{
            title: `${typeEmoji[type] || "💬"} New ${type}`,
            description: content.slice(0, 2000),
            color: ZEV_COLOR,
            footer: { text: `ID: ${feedbackItem.id.slice(0, 8)} | Source: ${source}` },
          }],
          components: [{
            type: 1,
            components: [
              { type: 2, style: 3, label: "Ship It", custom_id: `pipeline_approve_${feedbackItem.id}`, emoji: { name: "✅" } },
              { type: 2, style: 1, label: "Backlog", custom_id: `pipeline_backlog_${feedbackItem.id}`, emoji: { name: "📋" } },
              { type: 2, style: 4, label: "Decline", custom_id: `pipeline_wontfix_${feedbackItem.id}`, emoji: { name: "🚫" } },
            ],
          }],
        });
        if (messageId) {
          await platform(supabase)
            .from("feedback")
            .update({ discord_message_id: messageId })
            .eq("id", feedbackItem.id);
        }
      } catch (e) {
        console.error("[feedback] Pipeline posting failed:", e);
      }
    }
  });

  return NextResponse.json({
    feedback: feedbackItem,
    message: type === "bug"
      ? "Bug logged. We'll look into it."
      : type === "wish"
      ? "Wish captured. Added to the backlog."
      : "Thanks for the feedback!",
  }, { status: 201 });
});
