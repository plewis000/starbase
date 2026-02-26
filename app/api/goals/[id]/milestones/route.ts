import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";
import { recalculateAndUpdateGoalProgress } from "@/lib/goal-progress";

// ---- GET: List milestones for a goal ----

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify goal belongs to user
  const { data: goal } = await platform(supabase)
    .from("goals")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const { data: milestones, error } = await platform(supabase)
    .from("goal_milestones")
    .select("*")
    .eq("goal_id", id)
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ milestones: milestones || [] });
}

// ---- POST: Add milestone to a goal ----

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify goal belongs to user
  const { data: goal } = await platform(supabase)
    .from("goals")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const body = await request.json();
  const { title, description, target_date, sort_order } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (title.length > 300) {
    return NextResponse.json({ error: "Title must be 300 characters or fewer" }, { status: 400 });
  }

  const { data: milestone, error } = await platform(supabase)
    .from("goal_milestones")
    .insert({
      goal_id: id,
      title: title.trim(),
      description: description || null,
      target_date: target_date || null,
      sort_order: sort_order || 0,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "goal_milestone",
    entity_id: milestone.id,
    action: "created",
    performed_by: user.id,
    metadata: { goal_id: id },
  }).catch(console.error);

  return NextResponse.json({ milestone }, { status: 201 });
}
