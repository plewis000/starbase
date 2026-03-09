import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";
import { isValidUUID } from "@/lib/validation";
import { createEntityLinkSchema, parseBody } from "@/lib/schemas";

const VALID_ENTITY_TYPES = ["task", "goal", "shopping_item"] as const;

type EntityType = (typeof VALID_ENTITY_TYPES)[number];

/**
 * GET /api/entity-links?entity_type=task&entity_id=xxx
 * Returns all links for a given entity (from both directions).
 */
export const GET = withAuth(async (req: NextRequest, { supabase }) => {
  const entityType = req.nextUrl.searchParams.get("entity_type");
  const entityId = req.nextUrl.searchParams.get("entity_id");

  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: "entity_type and entity_id are required" },
      { status: 400 }
    );
  }

  if (!VALID_ENTITY_TYPES.includes(entityType as EntityType)) {
    return NextResponse.json(
      { error: `Invalid entity_type. Must be one of: ${VALID_ENTITY_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Fetch links where this entity is either source or target
  const [asSource, asTarget] = await Promise.all([
    platform(supabase)
      .from("entity_links")
      .select("*")
      .eq("source_type", entityType)
      .eq("source_id", entityId)
      .order("created_at", { ascending: false }),
    platform(supabase)
      .from("entity_links")
      .select("*")
      .eq("target_type", entityType)
      .eq("target_id", entityId)
      .order("created_at", { ascending: false }),
  ]);

  if (asSource.error) {
    console.error(asSource.error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  if (asTarget.error) {
    console.error(asTarget.error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Combine and deduplicate (shouldn't have dupes but be safe)
  const seen = new Set<string>();
  const links = [...(asSource.data || []), ...(asTarget.data || [])].filter((link) => {
    if (seen.has(link.id)) return false;
    seen.add(link.id);
    return true;
  });

  return NextResponse.json({ links });
});

/**
 * POST /api/entity-links
 * Create a new entity link.
 */
export const POST = withAuth(async (req: NextRequest, { supabase, user }) => {
  const parsed = await parseBody(req, createEntityLinkSchema);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { source_type, source_id, target_type, target_id, link_type, sync_completion } = parsed.data;

  const { data, error } = await platform(supabase)
    .from("entity_links")
    .insert({
      source_type,
      source_id,
      target_type,
      target_id,
      link_type,
      sync_completion: sync_completion ?? false,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This link already exists" }, { status: 409 });
    }
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Sync: when linking a task to a goal, also create goal_tasks row
  const goalType = source_type === "goal" ? "source" : target_type === "goal" ? "target" : null;
  const taskType = source_type === "task" ? "source" : target_type === "task" ? "target" : null;
  if (goalType && taskType) {
    const goalId = goalType === "source" ? source_id : target_id;
    const taskId = taskType === "source" ? source_id : target_id;
    await platform(supabase)
      .from("goal_tasks")
      .upsert({ goal_id: goalId, task_id: taskId }, { onConflict: "goal_id,task_id" });
  }

  return NextResponse.json({ link: data }, { status: 201 });
});

/**
 * DELETE /api/entity-links?id=xxx
 * Remove an entity link.
 */
export const DELETE = withAuth(async (req: NextRequest, { supabase, user }) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !isValidUUID(id)) {
    return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
  }

  const { error } = await platform(supabase)
    .from("entity_links")
    .delete()
    .eq("id", id)
    .eq("created_by", user.id);

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
