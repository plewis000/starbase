import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { platform, config } from "@/lib/supabase/schemas";
import { getConfigLookups, enrichTagAssociations } from "@/lib/task-enrichment";
import { getHouseholdContext, getHouseholdMemberIds, verifyTaskHouseholdAccess } from "@/lib/household";

// =============================================================
// POST /api/tasks/:id/tags — Add tags to a task
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
  const ctx = await getHouseholdContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No household found" }, { status: 404 });
  const memberIds = await getHouseholdMemberIds(supabase, ctx.household_id);
  if (!(await verifyTaskHouseholdAccess(supabase, id, memberIds))) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const body = await request.json();
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(supabase, {
    entity_type: "task",
    entity_id: id,
    action: "tags_added",
    performed_by: user.id,
    metadata: { tag_ids },
  });

  // Enrich tag associations with config.tags data
  const lookups = await getConfigLookups(supabase);
  const enrichedTags = enrichTagAssociations(inserted || [], lookups);

  return NextResponse.json({ tags: enrichedTags }, { status: 201 });
}
