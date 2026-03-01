// ============================================================
// FILE: app/api/pipeline/status/route.ts
// PURPOSE: Worker reports pipeline progress — triggers Discord notifications
// AUTH: PIPELINE_SECRET
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";
import { sendMessageWithButtons, sendMessage, ZEV_COLOR } from "@/lib/discord";
import { isValidUUID } from "@/lib/validation";

const PIPELINE_SECRET = process.env.PIPELINE_SECRET;
const GITHUB_REPO = process.env.GITHUB_REPO || "plewis000/starbase";

const VALID_PIPELINE_STATUSES = ["queued", "working", "preview_ready", "approved", "shipped", "rejected", "failed"] as const;
type PipelineStatus = typeof VALID_PIPELINE_STATUSES[number];

// Valid state transitions — prevents invalid jumps
const VALID_TRANSITIONS: Record<string, PipelineStatus[]> = {
  queued: ["working", "failed"],
  working: ["preview_ready", "failed"],
  preview_ready: ["shipped", "rejected"],
  failed: ["queued"], // retry
  rejected: ["queued"], // re-queue
};

// Map pipeline_status to feedback status
const STATUS_MAP: Record<string, string> = {
  working: "in_progress",
  failed: "planned", // back to planned for retry
  shipped: "done",
  rejected: "planned",
};

// POST /api/pipeline/status — worker updates pipeline state
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!PIPELINE_SECRET || auth !== `Bearer ${PIPELINE_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { feedback_id, pipeline_status, branch_name, preview_url, pr_number, worker_log } = body;

  if (!feedback_id || !isValidUUID(feedback_id)) {
    return NextResponse.json({ error: "Invalid feedback_id" }, { status: 400 });
  }

  if (!pipeline_status || !VALID_PIPELINE_STATUSES.includes(pipeline_status)) {
    return NextResponse.json({ error: "Invalid pipeline_status" }, { status: 400 });
  }

  // Require preview_url for preview_ready
  if (pipeline_status === "preview_ready" && !preview_url) {
    return NextResponse.json({ error: "preview_url required for preview_ready status" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch current state to validate transition
  const { data: current, error: fetchError } = await platform(supabase)
    .from("feedback")
    .select("pipeline_status")
    .eq("id", feedback_id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  // Validate transition
  const currentStatus = current.pipeline_status as string | null;
  if (currentStatus) {
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(pipeline_status as PipelineStatus)) {
      return NextResponse.json({
        error: `Cannot transition from '${currentStatus}' to '${pipeline_status}'`,
        current_status: currentStatus,
        allowed_transitions: allowed,
      }, { status: 409 });
    }
  }
  // If currentStatus is null, allow any initial status (typically "queued" or "working")

  // Build update payload
  const updateFields: Record<string, unknown> = {
    pipeline_status,
    updated_at: new Date().toISOString(),
  };

  // Type-validate optional fields
  if (branch_name !== undefined) {
    if (typeof branch_name !== "string") return NextResponse.json({ error: "branch_name must be a string" }, { status: 400 });
    updateFields.branch_name = branch_name;
  }
  if (preview_url !== undefined) {
    if (typeof preview_url !== "string") return NextResponse.json({ error: "preview_url must be a string" }, { status: 400 });
    updateFields.preview_url = preview_url;
  }
  if (pr_number !== undefined) {
    if (typeof pr_number !== "number" || !Number.isInteger(pr_number)) return NextResponse.json({ error: "pr_number must be an integer" }, { status: 400 });
    updateFields.pr_number = pr_number;
  }
  if (worker_log !== undefined) {
    if (typeof worker_log !== "string") return NextResponse.json({ error: "worker_log must be a string" }, { status: 400 });
    updateFields.worker_log = worker_log;
  }

  // Set timestamps based on status
  if (pipeline_status === "working") {
    updateFields.worker_started_at = new Date().toISOString();
  }
  if (pipeline_status === "preview_ready" || pipeline_status === "failed") {
    updateFields.worker_completed_at = new Date().toISOString();
  }

  // Update feedback status based on pipeline status
  if (STATUS_MAP[pipeline_status]) {
    updateFields.status = STATUS_MAP[pipeline_status];
  }

  const { data: feedback, error } = await platform(supabase)
    .from("feedback")
    .update(updateFields)
    .eq("id", feedback_id)
    .select("id, type, body, pipeline_status, branch_name, preview_url, pr_number")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Discord notifications (using after() for serverless safety)
  const channelId = process.env.PIPELINE_CHANNEL_ID;
  if (channelId) {
    const bodyPreview = feedback.body.slice(0, 100);
    after(async () => {
      try {
        if (pipeline_status === "working") {
          await sendMessage(channelId, `⚙️ **Working on:** ${bodyPreview}...`);
        } else if (pipeline_status === "preview_ready") {
          const previewLink = feedback.preview_url ? `[Open Preview](${feedback.preview_url})` : "Pending...";
          const prLink = feedback.pr_number ? `[PR #${feedback.pr_number}](https://github.com/${GITHUB_REPO}/pull/${feedback.pr_number})` : "—";
          const prodLink = `[Production](https://starbase-green.vercel.app)`;
          await sendMessageWithButtons(channelId, {
            embeds: [{
              title: "Preview Ready — Test Before Shipping",
              description: `**${bodyPreview}**\n\nTest on the preview environment first. Ship It sends to production.`,
              color: ZEV_COLOR,
              fields: [
                { name: "Preview", value: previewLink, inline: true },
                { name: "Pull Request", value: prLink, inline: true },
                { name: "Production", value: prodLink, inline: true },
              ],
            }],
            components: [{
              type: 1,
              components: [
                ...(feedback.preview_url ? [{ type: 2, style: 5, label: "Test Preview", url: feedback.preview_url }] : []),
                { type: 2, style: 3, label: "Ship It", custom_id: `pipeline_ship_${feedback_id}`, emoji: { name: "🚀" } },
                { type: 2, style: 4, label: "Reject", custom_id: `pipeline_reject_${feedback_id}`, emoji: { name: "❌" } },
              ],
            }],
          });
        } else if (pipeline_status === "failed") {
          await sendMessage(channelId, `❌ **Failed:** ${bodyPreview}\n\`\`\`${worker_log?.slice(0, 500) || "Unknown error"}\`\`\``);
        }
      } catch (e) { console.error("[pipeline-status] Discord notification failed:", e); }
    });
  }

  return NextResponse.json({ feedback });
}
