import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";
import { recalculateAndUpdateGoalProgress } from "@/lib/goal-progress";
import { awardXp, checkAchievements } from "@/lib/gamification";

// ---- PATCH: Update milestone (complete, rename, reorder) ----

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: goalId, milestoneId } = await params;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.target_date !== undefined) updates.target_date = body.target_date;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  // Handle completion toggle
  if (body.completed === true) {
    updates.completed_at = new Date().toISOString();
  } else if (body.completed === false) {
    updates.completed_at = null;
  }

  const { data: milestone, error } = await platform(supabase)
    .from("goal_milestones")
    .update(updates)
    .eq("id", milestoneId)
    .eq("goal_id", goalId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log activity
  const action = body.completed === true ? "completed" : "updated";
  await logActivity(supabase, {
    entity_type: "goal_milestone",
    entity_id: milestoneId,
    action,
    performed_by: user.id,
    metadata: { goal_id: goalId },
  }).catch(console.error);

  // Recalculate goal progress if milestone completion changed
  if (body.completed !== undefined) {
    await recalculateAndUpdateGoalProgress(supabase, goalId).catch(console.error);
  }

  // Award XP for completing a milestone (non-blocking)
  if (body.completed === true) {
    (async () => {
      try {
        await awardXp(
          supabase,
          user.id,
          40,
          "goal_milestone",
          `Milestone: ${milestone.title}`,
          milestoneId
        );
        await checkAchievements(supabase, user.id, "goal_milestone", {
          goalId,
          milestoneId,
        });
      } catch (err) {
        console.error("Gamification error:", err);
      }
    })();
  }

  return NextResponse.json({ milestone });
}

// ---- DELETE: Remove milestone ----

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: goalId, milestoneId } = await params;

  const { error } = await platform(supabase)
    .from("goal_milestones")
    .delete()
    .eq("id", milestoneId)
    .eq("goal_id", goalId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "goal_milestone",
    entity_id: milestoneId,
    action: "deleted",
    performed_by: user.id,
    metadata: { goal_id: goalId },
  }).catch(console.error);

  // Recalculate goal progress
  await recalculateAndUpdateGoalProgress(supabase, goalId).catch(console.error);

  return NextResponse.json({ success: true });
}
