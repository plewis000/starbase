import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { logActivity } from "@/lib/activity-log";
import { platform } from "@/lib/supabase/schemas";
import { getConfigLookups, enrichTagAssociations } from "@/lib/task-enrichment";
import { getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// =============================================================
// POST /api/tasks/:id/tags — Add tags to a task
// =============================================================
export const POST = withAuth(async (request, { supabase, user, ctx }, params) => {
  const id = params?.id;

  // Verify task belongs to user's household
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id!, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { tag_ids } = body;

  if (!tag_ids || !Array.isArray(tag_ids) || tag_ids.length === 0) {
    return NextResponse.json(
      { error: "tag_ids array is required" },
      { status: 400 }
    );
  }

  const { data: inserted, error } = await platform(supabase)
    .from("task_tags")
    .upsert(
      tag_ids.map((tagId: string) => ({
        task_id: id,
        tag_id: tagId,
      })),
      { onConflict: "task_id,tag_id", ignoreDuplicates: true }
    )
    .select("*");

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: id!,
    action: "tags_added",
    performed_by: user.id,
    metadata: { tag_ids },
  });

  // Enrich tag associations with config.tags data
  const lookups = await getConfigLookups(supabase);
  const enrichedTags = enrichTagAssociations(inserted || [], lookups);

  return NextResponse.json({ tags: enrichedTags }, { status: 201 });
});
