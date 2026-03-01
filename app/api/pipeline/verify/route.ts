// ============================================================
// FILE: app/api/pipeline/verify/route.ts
// PURPOSE: Admin approves or rejects preview deployment
//          Approve = merge PR to main (production deploy)
//          Reject = close PR, delete branch, optionally re-queue
// AUTH: Supabase session, admin role required
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext } from "@/lib/household";
import { sendMessage, CHANNELS, ZEV_COLOR } from "@/lib/discord";
import { isValidUUID, validateEnum } from "@/lib/validation";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = "plewis000/starbase";

async function githubApi(path: string, method = "GET", body?: Record<string, unknown>) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API ${method} ${path}: ${res.status} ${err}`);
  }
  return res.json();
}

// POST /api/pipeline/verify — admin approves or rejects preview
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

  const { feedback_id, action, reason } = body;
  if (!feedback_id || !isValidUUID(feedback_id)) {
    return NextResponse.json({ error: "Invalid feedback_id" }, { status: 400 });
  }

  const actionCheck = validateEnum(action, "action", ["approve", "reject"] as const);
  if (!actionCheck.valid) {
    return NextResponse.json({ error: actionCheck.error }, { status: 400 });
  }

  // Get feedback with pipeline state
  const { data: feedback } = await platform(supabase)
    .from("feedback")
    .select("id, body, status, pipeline_status, pr_number, branch_name, household_id, submitted_by")
    .eq("id", feedback_id)
    .single();

  if (!feedback) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  if (feedback.pipeline_status !== "preview_ready") {
    return NextResponse.json({
      error: `Cannot verify: pipeline_status is "${feedback.pipeline_status}", expected "preview_ready"`,
    }, { status: 409 });
  }

  const channelId = process.env.PIPELINE_CHANNEL_ID;
  const bodyPreview = feedback.body.slice(0, 100);

  if (action === "approve") {
    // Merge PR to main
    if (!GITHUB_TOKEN) {
      return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 });
    }

    try {
      await githubApi(`/pulls/${feedback.pr_number}/merge`, "PUT", {
        merge_method: "squash",
        commit_title: `${feedback.body.slice(0, 72)} (#${feedback.pr_number})`,
      });
    } catch (e) {
      return NextResponse.json({
        error: `Failed to merge PR: ${e instanceof Error ? e.message : "Unknown error"}`,
      }, { status: 500 });
    }

    // Clean up branch
    try {
      await githubApi(`/git/refs/heads/${feedback.branch_name}`, "DELETE");
    } catch { /* branch cleanup is best-effort */ }

    // Update feedback
    await platform(supabase)
      .from("feedback")
      .update({
        pipeline_status: "approved",
        status: "done",
        resolution_notified: false, // Will trigger notification to submitter
        updated_at: new Date().toISOString(),
      })
      .eq("id", feedback_id);

    if (channelId) {
      sendMessage(channelId, `🚀 **Shipped to production:** ${bodyPreview}`).catch(console.error);
    }

    return NextResponse.json({ message: "PR merged. Deploying to production.", action: "approved" });

  } else {
    // Reject: close PR, delete branch
    if (GITHUB_TOKEN && feedback.pr_number) {
      try {
        await githubApi(`/pulls/${feedback.pr_number}`, "PATCH", { state: "closed" });
        await githubApi(`/git/refs/heads/${feedback.branch_name}`, "DELETE");
      } catch { /* cleanup is best-effort */ }
    }

    // Update feedback — back to planned so it can be re-queued if desired
    await platform(supabase)
      .from("feedback")
      .update({
        pipeline_status: "rejected",
        worker_log: reason || "Rejected after preview review",
        branch_name: null,
        preview_url: null,
        pr_number: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", feedback_id);

    if (channelId) {
      sendMessage(channelId, `❌ **Rejected:** ${bodyPreview}${reason ? `\nReason: ${reason}` : ""}`).catch(console.error);
    }

    return NextResponse.json({ message: "PR closed. Feedback can be re-approved.", action: "rejected" });
  }
}
