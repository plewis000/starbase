// ============================================================
// FILE: app/api/pipeline/queue/route.ts
// PURPOSE: Worker polls for approved feedback items ready for work
// AUTH: PIPELINE_SECRET (not Supabase session — worker runs locally)
// PART OF: Desperado Club
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";

const PIPELINE_SECRET = process.env.PIPELINE_SECRET;

// GET /api/pipeline/queue — returns feedback items queued for work
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!PIPELINE_SECRET || auth !== `Bearer ${PIPELINE_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

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
