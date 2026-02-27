import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { logActivity } from "@/lib/activity-log";
import { recalculateAndUpdateGoalProgress } from "@/lib/goal-progress";

// ---- GET: List tasks linked to a goal ----

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: goalId } = await params;

  // Verify goal exists and belongs to user
  const { data: goal } = await platform(supabase)
    .from("goals")
    .select("id")
    .eq("id", goalId)
    .eq("owner_id", user.id)
    .single();

  if (!goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  // Get links
  const { data: links, error } = await platform(supabase)
    .from("goal_tasks")
    .select("*")
    .eq("goal_id", goalId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!links || links.length === 0) {
    return NextResponse.json({ tasks: [] });
  }

  // Fetch task details
  const taskIds = links.map((l) => l.task_id);
  const { data: tasks } = await platform(supabase)
    .from("tasks")
    .select("id, title, status_id, priority_id, due_date, completed_at, assigned_to")
    .in("id", taskIds);

  // Merge link data
  const enrichedTasks = (tasks || []).map((t) => {
    const link = links.find((l) => l.task_id === t.id);
    return {
      ...t,
      link_id: link?.id,
      linked_at: link?.created_at,
    };
  });

  return NextResponse.json({ tasks: enrichedTasks });
}

// ---- POST: Link a task to a goal ----

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: goalId } = await params;
  const body = await request.json();
  const { task_id } = body;

  if (!task_id || typeof task_id !== "string") {
    return NextResponse.json({ error: "task_id is required" }, { status: 400 });
  }

  // Verify goal belongs to user
  const { data: goal } = await platform(supabase)
    .from("goals")
    .select("id, progress_type")
    .eq("id", goalId)
    .eq("owner_id", user.id)
    .single();

  if (!goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  // Verify task exists (tasks are shared household, so just check it exists)
  const { data: task } = await platform(supabase)
    .from("tasks")
    .select("id, title")
    .eq("id", task_id)
    .single();

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Insert link
  const { data: link, error } = await platform(supabase)
    .from("goal_tasks")
    .insert({
      goal_id: goalId,
      task_id: task_id,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This task is already linked to this goal" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "goal_task",
    entity_id: link.id,
    action: "linked",
    performed_by: user.id,
    metadata: { goal_id: goalId, task_id: task_id, task_title: task.title },
  }).catch(console.error);

  // Recalculate progress if task-driven
  if (goal.progress_type === "task_driven") {
    await recalculateAndUpdateGoalProgress(supabase, goalId).catch(console.error);
  }

  return NextResponse.json({ link }, { status: 201 });
}

// ---- DELETE: Unlink a task from a goal ----

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: goalId } = await params;
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("task_id");

  if (!taskId) {
    return NextResponse.json(
      { error: "task_id query param required" },
      { status: 400 }
    );
  }

  // Verify goal belongs to user
  const { data: goal } = await platform(supabase)
    .from("goals")
    .select("id, progress_type")
    .eq("id", goalId)
    .eq("owner_id", user.id)
    .single();

  if (!goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const { error } = await platform(supabase)
    .from("goal_tasks")
    .delete()
    .eq("goal_id", goalId)
    .eq("task_id", taskId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "goal_task",
    entity_id: goalId,
    action: "unlinked",
    performed_by: user.id,
    metadata: { goal_id: goalId, task_id: taskId },
  }).catch(console.error);

  // Recalculate progress if task-driven
  if (goal.progress_type === "task_driven") {
    await recalculateAndUpdateGoalProgress(supabase, goalId).catch(console.error);
  }

  return NextResponse.json({ success: true });
}
