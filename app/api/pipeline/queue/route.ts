// ============================================================
// FILE: app/api/pipeline/queue/route.ts
// PURPOSE: Worker polls for approved feedback items ready for work
// AUTH: PIPELINE_SECRET (not Supabase session — worker runs locally)
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { platform } from "@/lib/supabase/schemas";

const PIPELINE_SECRET = process.env.PIPELINE_SECRET;

// GET /api/pipeline/queue — returns feedback items queued for work
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!PIPELINE_SECRET || auth !== `Bearer ${PIPELINE_SECRET}`) {
    return NextResponse.json({
      error: "Unauthorized",
      debug: {
        has_secret: !!PIPELINE_SECRET,
        secret_first8: PIPELINE_SECRET?.slice(0, 8) || "MISSING",
        auth_first8: auth?.replace("Bearer ", "").slice(0, 8) || "MISSING",
        match: auth === `Bearer ${PIPELINE_SECRET}`,
      },
    }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: jobs, error } = await platform(supabase)
    .from("feedback")
    .select("id, type, body, priority, tags, ai_classified_severity, ai_extracted_feature, created_at")
    .eq("status", "planned")
    .eq("pipeline_status", "queued")
    .order("priority", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: jobs || [] });
}
