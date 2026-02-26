import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { safeParseBody, isValidUUID, validateEnum } from "@/lib/validation";

const VALID_ENTITY_TYPES = ["task", "goal", "habit"] as const;
const VALID_WATCH_LEVELS = ["all", "mentions_only", "muted"] as const;

// ---- GET: List watchers for an entity ----

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entityType, entityId } = await params;

  const etCheck = validateEnum(entityType, "entityType", VALID_ENTITY_TYPES);
  if (!etCheck.valid) return NextResponse.json({ error: etCheck.error }, { status: 400 });
  if (!isValidUUID(entityId)) return NextResponse.json({ error: "Invalid entity ID" }, { status: 400 });

  const { data: watchers, error } = await platform(supabase)
    .from("entity_watchers")
    .select("id, user_id, watch_level, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with user info
  const userIds = (watchers || []).map((w) => w.user_id);
  let userMap = new Map<string, Record<string, unknown>>();
  if (userIds.length > 0) {
    const { data: users } = await platform(supabase)
      .from("users")
      .select("id, display_name, full_name, email, avatar_url")
      .in("id", userIds);
    if (users) userMap = new Map(users.map((u) => [u.id, u]));
  }

  const enriched = (watchers || []).map((w) => ({
    ...w,
    user: userMap.get(w.user_id) || null,
    is_current_user: w.user_id === user.id,
  }));

  // Also return current user's watch status
  const myWatch = enriched.find((w) => w.is_current_user);

  return NextResponse.json({
    watchers: enriched,
    my_watch_status: myWatch ? myWatch.watch_level : null,
    total: enriched.length,
  });
}

// ---- POST: Watch an entity (or update watch level) ----

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entityType, entityId } = await params;

  const etCheck = validateEnum(entityType, "entityType", VALID_ENTITY_TYPES);
  if (!etCheck.valid) return NextResponse.json({ error: etCheck.error }, { status: 400 });
  if (!isValidUUID(entityId)) return NextResponse.json({ error: "Invalid entity ID" }, { status: 400 });

  const parsed = await safeParseBody(request);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const watchLevel = parsed.body.watch_level || "all";
  const wlCheck = validateEnum(watchLevel as string, "watch_level", VALID_WATCH_LEVELS);
  if (!wlCheck.valid) return NextResponse.json({ error: wlCheck.error }, { status: 400 });

  // Upsert watcher
  const { data: watcher, error } = await platform(supabase)
    .from("entity_watchers")
    .upsert(
      {
        entity_type: entityType,
        entity_id: entityId,
        user_id: user.id,
        watch_level: wlCheck.value,
      },
      { onConflict: "entity_type,entity_id,user_id" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ watcher }, { status: 201 });
}

// ---- DELETE: Unwatch an entity ----

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entityType, entityId } = await params;

  const etCheck = validateEnum(entityType, "entityType", VALID_ENTITY_TYPES);
  if (!etCheck.valid) return NextResponse.json({ error: etCheck.error }, { status: 400 });
  if (!isValidUUID(entityId)) return NextResponse.json({ error: "Invalid entity ID" }, { status: 400 });

  const { error } = await platform(supabase)
    .from("entity_watchers")
    .delete()
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
