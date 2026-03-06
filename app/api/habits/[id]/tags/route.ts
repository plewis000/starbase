import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { platform, config } from "@/lib/supabase/schemas";
import { safeParseBody, isValidUUID, validateUUIDArray } from "@/lib/validation";

// ---- GET: List tags for a habit ----

export const GET = withAuth(async (request, { supabase, user }, params) => {
  const id = params!.id;
  if (!isValidUUID(id || "")) return NextResponse.json({ error: "Invalid habit ID" }, { status: 400 });

  // Verify ownership
  const { data: habit } = await platform(supabase)
    .from("habits")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!habit) return NextResponse.json({ error: "Habit not found" }, { status: 404 });

  const { data: habitTags, error } = await platform(supabase)
    .from("habit_tags")
    .select("id, tag_id, created_at")
    .eq("habit_id", id);

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  // Enrich with tag details
  const tagIds = (habitTags || []).map((ht) => ht.tag_id);
  let tagMap = new Map<string, Record<string, unknown>>();
  if (tagIds.length > 0) {
    const { data: tags } = await config(supabase)
      .from("tags")
      .select("id, name, slug, display_color, icon")
      .in("id", tagIds);
    if (tags) tagMap = new Map(tags.map((t) => [t.id, t]));
  }

  const enriched = (habitTags || []).map((ht) => ({
    ...ht,
    tag: tagMap.get(ht.tag_id) || null,
  }));

  return NextResponse.json({ tags: enriched });
});

// ---- POST: Add tags to a habit ----

export const POST = withAuth(async (request, { supabase, user }, params) => {
  const id = params!.id;
  if (!isValidUUID(id || "")) return NextResponse.json({ error: "Invalid habit ID" }, { status: 400 });

  const { data: habit } = await platform(supabase)
    .from("habits")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!habit) return NextResponse.json({ error: "Habit not found" }, { status: 404 });

  const parsed = await safeParseBody(request);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const tagIdsCheck = validateUUIDArray(parsed.body.tag_ids, "tag_ids", 20);
  if (!tagIdsCheck.valid) return NextResponse.json({ error: tagIdsCheck.error }, { status: 400 });
  if (tagIdsCheck.value.length === 0) {
    return NextResponse.json({ error: "tag_ids must contain at least one tag" }, { status: 400 });
  }

  const rows = tagIdsCheck.value.map((tagId) => ({
    habit_id: id,
    tag_id: tagId,
  }));

  const { data: inserted, error } = await platform(supabase)
    .from("habit_tags")
    .upsert(rows, { onConflict: "habit_id,tag_id" })
    .select("*");

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  return NextResponse.json({ habit_tags: inserted }, { status: 201 });
});

// ---- DELETE: Remove a tag from a habit ----

export const DELETE = withAuth(async (request, { supabase, user }, params) => {
  const id = params!.id;
  if (!isValidUUID(id || "")) return NextResponse.json({ error: "Invalid habit ID" }, { status: 400 });

  const { data: habit } = await platform(supabase)
    .from("habits")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!habit) return NextResponse.json({ error: "Habit not found" }, { status: 404 });

  const url = new URL(request.url);
  const tagId = url.searchParams.get("tag_id");
  if (!tagId || !isValidUUID(tagId)) {
    return NextResponse.json({ error: "tag_id query parameter is required and must be a valid UUID" }, { status: 400 });
  }

  const { error } = await platform(supabase)
    .from("habit_tags")
    .delete()
    .eq("habit_id", id)
    .eq("tag_id", tagId);

  if (error) { console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }

  return NextResponse.json({ success: true });
});
