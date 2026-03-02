import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncCompletion } from "@/lib/entity-links";

const VALID_ENTITY_TYPES = ["task", "habit", "goal", "shopping_item"] as const;
type EntityType = (typeof VALID_ENTITY_TYPES)[number];

/**
 * POST /api/entity-links/sync
 * Trigger completion sync for an entity that was just completed.
 * Propagates completion to all linked entities with sync_completion=true.
 *
 * Body: { entity_type: string, entity_id: string }
 * Response: { synced: number, errors: string[] }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { entity_type, entity_id } = body;

  if (!entity_type || !entity_id) {
    return NextResponse.json(
      { error: "entity_type and entity_id are required" },
      { status: 400 }
    );
  }

  if (!VALID_ENTITY_TYPES.includes(entity_type as EntityType)) {
    return NextResponse.json(
      { error: `Invalid entity_type. Must be one of: ${VALID_ENTITY_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const result = await syncCompletion(supabase, entity_type, entity_id, user.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Sync failed: ${err}` },
      { status: 500 }
    );
  }
}
