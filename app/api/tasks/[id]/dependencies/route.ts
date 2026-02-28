import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { platform } from "@/lib/supabase/schemas";
import { getHouseholdContext, getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// =============================================================
// GET /api/tasks/:id/dependencies — List dependencies (both directions)
// =============================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify task belongs to user's household
  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household found" }, { status: 404 });
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Tasks this task depends on (this task is blocked BY them)
  const { data: blockedBy } = await platform(supabase)
    .from("task_dependencies")
    .select("id, depends_on_id, dependency_type")
    .eq("task_id", id);

  // Tasks that depend on this task (this task BLOCKS them)
  const { data: blocks } = await platform(supabase)
    .from("task_dependencies")
    .select("id, task_id, dependency_type")
    .eq("depends_on_id", id);

  return NextResponse.json({
    blocked_by: blockedBy || [],
    blocks: blocks || [],
  });
}

// =============================================================
// POST /api/tasks/:id/dependencies — Add dependency
// =============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify task belongs to user's household
  const ctxPost = await getHouseholdContext(supabase, user.id);
  if (!ctxPost) return NextResponse.json({ error: "No household found" }, { status: 404 });
  const memberIdsPost = await getHouseholdMemberIds(supabase, ctxPost.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id, memberIdsPost))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const body = await request.json();
  const { depends_on_id, dependency_type } = body;

  if (!depends_on_id) {
    return NextResponse.json(
      { error: "depends_on_id is required" },
      { status: 400 }
    );
  }

  if (depends_on_id === id) {
    return NextResponse.json(
      { error: "A task cannot depend on itself" },
      { status: 400 }
    );
  }

  // Circular dependency check: walk the dependency graph from depends_on_id
  // If we can reach `id`, it would be circular
  const visited = new Set<string>();
  const queue = [depends_on_id];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === id) {
      return NextResponse.json(
        { error: "Circular dependency detected" },
        { status: 400 }
      );
    }
    if (visited.has(current)) continue;
    visited.add(current);

    const { data: upstream } = await platform(supabase)
      .from("task_dependencies")
      .select("depends_on_id")
      .eq("task_id", current);

    if (upstream) {
      for (const dep of upstream) {
        if (!visited.has(dep.depends_on_id)) {
          queue.push(dep.depends_on_id);
        }
      }
    }
  }

  const { data: dep, error } = await platform(supabase)
    .from("task_dependencies")
    .insert({
      task_id: id,
      depends_on_id,
      dependency_type: dependency_type || "blocks",
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This dependency already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: id,
    action: "dependency_added",
    performed_by: user.id,
    metadata: { depends_on_id, dependency_type: dependency_type || "blocks" },
  });

  return NextResponse.json({ dependency: dep }, { status: 201 });
}
