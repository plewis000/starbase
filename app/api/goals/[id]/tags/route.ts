import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform, config } from "@/lib/supabase/schemas";
import { safeParseBody, isValidUUID, validateUUIDArray } from "@/lib/validation";

// ---- GET: List tags for a goal ----

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });

  // Verify ownership
  const { data: goal } = await platform(supabase)
    .from("goals")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  const { data: goalTags, error } = await platform(supabase)
    .from("goal_tags")
    .select("id, tag_id, created_at")
    .eq("goal_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with tag details from config schema
  const tagIds = (goalTags || []).map((gt) => gt.tag_id);
  let tagMap = new Map<string, Record<string, unknown>>();
  if (tagIds.length > 0) {
    const { data: tags } = await config(supabase)
      .from("tags")
      .select("id, name, slug, display_color, icon")
      .in("id", tagIds);
    if (tags) tagMap = new Map(tags.map((t) => [t.id, t]));
  }

  const enriched = (goalTags || []).map((gt) => ({
    ...gt,
    tag: tagMap.get(gt.tag_id) || null,
  }));

  return NextResponse.json({ tags: enriched });
}

// ---- POST: Add tags to a goal ----

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });

  // Verify ownership
  const { data: goal } = await platform(supabase)
    .from("goals")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  const parsed = await safeParseBody(request);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const tagIdsCheck = validateUUIDArray(parsed.body.tag_ids, "tag_ids", 20);
  if (!tagIdsCheck.valid) return NextResponse.json({ error: tagIdsCheck.error }, { status: 400 });
  if (tagIdsCheck.value.length === 0) {
    return NextResponse.json({ error: "tag_ids must contain at least one tag" }, { status: 400 });
  }

  // Insert (ignore duplicates via ON CONFLICT)
  const rows = tagIdsCheck.value.map((tagId) => ({
    goal_id: id,
    tag_id: tagId,
  }));

  const { data: inserted, error } = await platform(supabase)
    .from("goal_tags")
    .upsert(rows, { onConflict: "goal_id,tag_id" })
    .select("*");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ goal_tags: inserted }, { status: 201 });
}

// ---- DELETE: Remove a tag from a goal ----

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 });

  // Verify ownership
  const { data: goal } = await platform(supabase)
    .from("goals")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  const tagId = request.nextUrl.searchParams.get("tag_id");
  if (!tagId || !isValidUUID(tagId)) {
    return NextResponse.json({ error: "tag_id query parameter is required and must be a valid UUID" }, { status: 400 });
  }

  const { error } = await platform(supabase)
    .from("goal_tags")
    .delete()
    .eq("goal_id", id)
    .eq("tag_id", tagId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
