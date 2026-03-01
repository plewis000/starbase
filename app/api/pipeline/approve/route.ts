// ============================================================
// FILE: app/api/pipeline/approve/route.ts
// PURPOSE: Admin approves feedback for pipeline work (queues it for worker)
// AUTH: Supabase session, admin role required
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import { isValidUUID } from "@/lib/validation";

// POST /api/pipeline/approve — admin queues feedback for worker
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx || ctx.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { feedback_id } = body;
  if (!feedback_id || !isValidUUID(feedback_id)) {
    return NextResponse.json({ error: "Invalid feedback_id" }, { status: 400 });
  }

  // Verify feedback exists and belongs to this household
  const { data: feedback } = await platform(supabase)
    .from("feedback")
    .select("id, status, pipeline_status, household_id, body, type")
    .eq("id", feedback_id)
    .single();

  if (!feedback) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  if (feedback.household_id && feedback.household_id !== ctx.household_id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Don't re-queue already active pipeline jobs
  if (feedback.pipeline_status === "working") {
    return NextResponse.json({ error: "Already being worked on" }, { status: 409 });
  }

  const { data: updated, error } = await platform(supabase)
    .from("feedback")
    .update({
      status: "planned",
      pipeline_status: "queued",
      updated_at: new Date().toISOString(),
    })
    .eq("id", feedback_id)
    .select("id, type, body, status, pipeline_status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    feedback: updated,
    message: "Queued for pipeline. Worker will pick it up.",
  });
}
