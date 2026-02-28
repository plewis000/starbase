// ============================================================
// FILE: app/api/feedback/[id]/route.ts
// PURPOSE: Feedback triage — update status, priority, respond, link to task
//          Zev can also update AI classification fields
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import { triggerNotification } from "@/lib/notify";
import {
  isValidUUID,
  validateOptionalString,
  validateEnum,
} from "@/lib/validation";
import type { FeedbackStatus } from "@/lib/types";

const VALID_STATUSES: readonly FeedbackStatus[] = ["new", "acknowledged", "planned", "in_progress", "done", "wont_fix"] as const;

// GET /api/feedback/[id] — get single feedback with votes
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { data: feedback, error } = await platform(supabase)
    .from("feedback")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !feedback) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get vote count
  const { data: votes } = await platform(supabase)
    .from("feedback_votes")
    .select("user_id")
    .eq("feedback_id", id);

  return NextResponse.json({
    feedback: {
      ...feedback,
      vote_count: votes?.length || 0,
      voted_by_me: votes?.some((v) => v.user_id === user.id) || false,
    },
  });
}

// PATCH /api/feedback/[id] — triage: status, priority, response, AI fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) {
    return NextResponse.json({ error: "No household found" }, { status: 404 });
  }

  // Verify feedback belongs to this household or was submitted by this user
  const { data: feedbackCheck } = await platform(supabase)
    .from("feedback")
    .select("household_id, submitted_by")
    .eq("id", id)
    .single();

  if (!feedbackCheck) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  if (feedbackCheck.household_id !== ctx.household_id && feedbackCheck.submitted_by !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Status
  if ("status" in body) {
    const check = validateEnum(body.status, "status", VALID_STATUSES);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.status = check.value;
  }

  // Priority (1-5)
  if ("priority" in body) {
    const p = typeof body.priority === "number" ? body.priority : parseInt(body.priority);
    if (isNaN(p) || p < 1 || p > 5) {
      return NextResponse.json({ error: "priority must be 1-5" }, { status: 400 });
    }
    updateFields.priority = p;
  }

  // Response (reply back to submitter)
  if ("response" in body) {
    const check = validateOptionalString(body.response, "response", 2000);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    updateFields.response = check.value;
    updateFields.response_by = user.id;
  }

  // AI fields (set by Zev or batch job)
  if ("ai_classified_type" in body) updateFields.ai_classified_type = body.ai_classified_type;
  if ("ai_classified_severity" in body) updateFields.ai_classified_severity = body.ai_classified_severity;
  if ("ai_extracted_feature" in body) updateFields.ai_extracted_feature = body.ai_extracted_feature;
  if ("related_feedback_ids" in body) updateFields.related_feedback_ids = body.related_feedback_ids;
  if ("tags" in body) updateFields.tags = body.tags;
  if ("task_id" in body) updateFields.task_id = body.task_id;

  const { data: updated, error } = await platform(supabase)
    .from("feedback")
    .update(updateFields)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If status changed to done and resolution not yet notified, notify submitter
  if (body.status === "done" && updated && !updated.resolution_notified) {
    await triggerNotification(supabase, {
      recipientUserId: updated.submitted_by,
      title: "Your feedback was addressed",
      body: updated.response || `"${updated.body.slice(0, 80)}" has been resolved.`,
      event: "system",
      metadata: { feedback_id: id },
    });

    await platform(supabase)
      .from("feedback")
      .update({ resolution_notified: true })
      .eq("id", id);
  }

  return NextResponse.json({ feedback: updated });
}
