import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";

// GET /api/feedback — List all feedback (both users can see everything)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const type = params.get("type");

  let query = platform(supabase)
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (type) query = query.eq("type", type);

  const { data: feedback, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ feedback: feedback || [] });
}

// POST /api/feedback — Submit feedback
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { type, body: feedbackBody, channel, priority, tags } = body;

  if (!feedbackBody || typeof feedbackBody !== "string" || !feedbackBody.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const validTypes = ["bug", "feature_request", "improvement", "complaint"];
  const validChannels = ["discord", "web", "claude_code"];

  const { data: feedback, error } = await platform(supabase)
    .from("feedback")
    .insert({
      submitted_by: user.id,
      type: validTypes.includes(type) ? type : "improvement",
      body: feedbackBody.trim(),
      channel: validChannels.includes(channel) ? channel : "web",
      priority: ["low", "medium", "high"].includes(priority) ? priority : "medium",
      tags: Array.isArray(tags) ? tags : [],
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ feedback }, { status: 201 });
}
