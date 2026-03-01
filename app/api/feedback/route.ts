// ============================================================
// FILE: app/api/feedback/route.ts
// PURPOSE: Feedback submission + listing — frictionless input from any user
//          Zev classifies after submission. No priority required at submit time.
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import { triggerNotification } from "@/lib/notify";
import { sendMessageWithButtons, ZEV_COLOR } from "@/lib/discord";
import {
  validateRequiredString,
  validateOptionalString,
  validateEnum,
  validatePagination,
} from "@/lib/validation";
import type { FeedbackType, FeedbackStatus, FeedbackSource } from "@/lib/types";

const VALID_TYPES: readonly FeedbackType[] = ["bug", "wish", "feedback", "question"] as const;
const VALID_STATUSES: readonly FeedbackStatus[] = ["new", "acknowledged", "planned", "in_progress", "done", "wont_fix"] as const;
const VALID_SOURCES: readonly FeedbackSource[] = ["chat", "discord", "web_form", "system"] as const;

// GET /api/feedback — list feedback with filters
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
}

// POST /api/feedback — submit feedback (frictionless)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only body is truly required — everything else has defaults or is optional
  const bodyCheck = validateRequiredString(body.body, "body", 5000);
  if (!bodyCheck.valid) return NextResponse.json({ error: bodyCheck.error }, { status: 400 });

  const typeCheck = validateEnum(body.type || "feedback", "type", VALID_TYPES);
  if (!typeCheck.valid) return NextResponse.json({ error: typeCheck.error }, { status: 400 });

  const sourceCheck = validateEnum(body.source || "web_form", "source", VALID_SOURCES);
  if (!sourceCheck.valid) return NextResponse.json({ error: sourceCheck.error }, { status: 400 });

  const pageUrlCheck = validateOptionalString(body.page_url, "page_url", 500);
  if (!pageUrlCheck.valid) return NextResponse.json({ error: pageUrlCheck.error }, { status: 400 });

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
    type: typeCheck.value,
    body: bodyCheck.value,
    page_url: pageUrlCheck.value || body.page_url || null,
    screenshot_url: body.screenshot_url || null,
    source: sourceCheck.value,
    conversation_id: body.conversation_id || null,
    tags: body.tags || null,
  };

  const { data: feedbackItem, error } = await platform(supabase)
    .from("feedback")
    .insert(insertPayload)
    .select("id, type, body, status, created_at")
    .single();

  if (error) {
    console.error("[feedback] insert failed:", JSON.stringify({ message: error.message, details: error.details, hint: error.hint, code: error.code, payload: insertPayload }));
    return NextResponse.json({ error: error.message }, { status: 500 });
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
            title: `${typeEmoji[typeCheck.value]} New ${typeCheck.value}: ${bodyCheck.value.slice(0, 80)}`,
            body: bodyCheck.value.length > 80 ? bodyCheck.value.slice(0, 200) + "..." : bodyCheck.value,
            event: "system",
            metadata: {
              feedback_id: feedbackItem.id,
              feedback_type: typeCheck.value,
              page_url: pageUrlCheck.value,
            },
          });
        }
      } catch { /* ignore notification failures */ }
    }

    // Post to #pipeline with Approve/Won't Fix buttons
    const pipelineChannelId = process.env.PIPELINE_CHANNEL_ID;
    if (pipelineChannelId) {
      try {
        const typeEmoji: Record<string, string> = {
          bug: "🐛", wish: "⭐", feedback: "💬", question: "❓",
        };
        const messageId = await sendMessageWithButtons(pipelineChannelId, {
          embeds: [{
            title: `${typeEmoji[typeCheck.value] || "💬"} New ${typeCheck.value}`,
            description: bodyCheck.value.slice(0, 2000),
            color: ZEV_COLOR,
            footer: { text: `ID: ${feedbackItem.id.slice(0, 8)} | Source: ${sourceCheck.value}` },
          }],
          components: [{
            type: 1,
            components: [
              { type: 2, style: 3, label: "Approve", custom_id: `pipeline_approve_${feedbackItem.id}`, emoji: { name: "✅" } },
              { type: 2, style: 4, label: "Won't Fix", custom_id: `pipeline_wontfix_${feedbackItem.id}`, emoji: { name: "🚫" } },
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
    message: typeCheck.value === "bug"
      ? "Bug logged. We'll look into it."
      : typeCheck.value === "wish"
      ? "Wish captured. Added to the backlog."
      : "Thanks for the feedback!",
  }, { status: 201 });
}
