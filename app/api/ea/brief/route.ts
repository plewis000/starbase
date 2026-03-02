/**
 * POST /api/ea/brief — On-demand brief generation
 *
 * Called by the /brief Discord slash command handler.
 * Receives pre-fetched Gmail data and runs the pipeline.
 *
 * Auth: PIPELINE_SECRET bearer token (same as other internal routes).
 */

import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/ea/pipeline";
import type { ParsedEmail } from "@/lib/ea/scanner";

export async function POST(request: NextRequest) {
  // Auth check
  const secret = process.env.PIPELINE_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      emails,
      brief_type = "on_demand",
      channel_id,
    } = body as {
      emails: ParsedEmail[];
      brief_type?: "daily" | "on_demand" | "weekly";
      channel_id?: string;
    };

    if (!emails || !Array.isArray(emails)) {
      return NextResponse.json(
        { error: "emails array required" },
        { status: 400 }
      );
    }

    const discordChannel = channel_id || process.env.EA_CHANNEL_ID || process.env.PIPELINE_CHANNEL_ID;

    const result = await runPipeline(emails, brief_type, discordChannel);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/ea/brief] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
