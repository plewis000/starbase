import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";

const VALID_ENTITY_TYPES = ["task", "habit", "goal", "shopping_item"] as const;
type EntityType = (typeof VALID_ENTITY_TYPES)[number];

/**
 * POST /api/entity-links/batch
 * Returns a map of entity_id → link_count for a batch of entities of the same type.
 *
 * Body: { entity_type: string, entity_ids: string[] }
 * Response: { linked: Record<string, number> }
 *
 * Example: { entity_type: "shopping_item", entity_ids: ["abc", "def"] }
 * Returns: { linked: { "abc": 2 } }  (def has 0 links, omitted)
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

  const { entity_type, entity_ids } = body;

  if (!entity_type || !Array.isArray(entity_ids) || entity_ids.length === 0) {
    return NextResponse.json(
      { error: "entity_type (string) and entity_ids (string[]) are required" },
      { status: 400 }
    );
  }

  if (!VALID_ENTITY_TYPES.includes(entity_type as EntityType)) {
    return NextResponse.json(
      { error: `Invalid entity_type. Must be one of: ${VALID_ENTITY_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Cap at 100 to prevent abuse
  const ids = entity_ids.slice(0, 100);

  // Query both directions in parallel
  const [asSource, asTarget] = await Promise.all([
    platform(supabase)
      .from("entity_links")
      .select("source_id")
      .eq("source_type", entity_type)
      .in("source_id", ids),
    platform(supabase)
      .from("entity_links")
      .select("target_id")
      .eq("target_type", entity_type)
      .in("target_id", ids),
  ]);

  const linked: Record<string, number> = {};

  for (const row of asSource.data || []) {
    linked[row.source_id] = (linked[row.source_id] || 0) + 1;
  }
  for (const row of asTarget.data || []) {
    linked[row.target_id] = (linked[row.target_id] || 0) + 1;
  }

  return NextResponse.json({ linked });
}
