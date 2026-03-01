// ============================================================
// FILE: app/api/pipeline/status/route.ts
// PURPOSE: Worker reports pipeline progress — triggers Discord notifications
// AUTH: PIPELINE_SECRET
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";
import { sendMessageWithButtons, sendMessage, CHANNELS, ZEV_COLOR } from "@/lib/discord";
import { isValidUUID } from "@/lib/validation";

const PIPELINE_SECRET = process.env.PIPELINE_SECRET;
const VALID_PIPELINE_STATUSES = ["queued", "working", "preview_ready", "approved", "rejected", "failed"] as const;

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

  const supabase = createServiceClient();

  // Build update payload
  const updateFields: Record<string, unknown> = {
    pipeline_status,
    updated_at: new Date().toISOString(),
  };

  if (branch_name !== undefined) updateFields.branch_name = branch_name;
  if (preview_url !== undefined) updateFields.preview_url = preview_url;
  if (pr_number !== undefined) updateFields.pr_number = pr_number;
  if (worker_log !== undefined) updateFields.worker_log = worker_log;

  if (pipeline_status === "working") {
    updateFields.worker_started_at = new Date().toISOString();
    updateFields.status = "in_progress";
  }
  if (pipeline_status === "preview_ready" || pipeline_status === "failed") {
    updateFields.worker_completed_at = new Date().toISOString();
  }

  const { data: feedback, error } = await platform(supabase)
    .from("feedback")
    .update(updateFields)
    .eq("id", feedback_id)
    .select("id, type, body, pipeline_status, branch_name, preview_url, pr_number")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Discord notifications (fire-and-forget)
  const channelId = process.env.PIPELINE_CHANNEL_ID;
  if (channelId) {
    const bodyPreview = feedback.body.slice(0, 100);
    (async () => {
      try {
        if (pipeline_status === "working") {
          await sendMessage(channelId, `⚙️ **Working on:** ${bodyPreview}...`);
        } else if (pipeline_status === "preview_ready") {
          await sendMessageWithButtons(channelId, {
            embeds: [{
              title: "✅ Preview Ready",
              description: bodyPreview,
              color: ZEV_COLOR,
              fields: [
                { name: "Preview", value: feedback.preview_url || "Pending...", inline: true },
                { name: "PR", value: feedback.pr_number ? `#${feedback.pr_number}` : "—", inline: true },
                { name: "Branch", value: feedback.branch_name || "—", inline: true },
              ],
            }],
            components: [{
              type: 1,
              components: [
                { type: 2, style: 3, label: "Ship It", custom_id: `pipeline_ship_${feedback_id}`, emoji: { name: "🚀" } },
                { type: 2, style: 4, label: "Reject", custom_id: `pipeline_reject_${feedback_id}`, emoji: { name: "❌" } },
              ],
            }],
          });
        } else if (pipeline_status === "failed") {
          await sendMessage(channelId, `❌ **Failed:** ${bodyPreview}\n\`\`\`${worker_log?.slice(0, 500) || "Unknown error"}\`\`\``);
        }
      } catch (e) { console.error("[pipeline-status] Discord notification failed:", e); }
    })();
  }

  return NextResponse.json({ feedback });
}
