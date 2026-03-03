import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";

const VALID_ENTITY_TYPES = ["task", "habit", "goal", "shopping_item"] as const;
const VALID_LINK_TYPES = ["derived_from", "tracks", "syncs_with"] as const;

type EntityType = (typeof VALID_ENTITY_TYPES)[number];
type LinkType = (typeof VALID_LINK_TYPES)[number];

/**
 * GET /api/entity-links?entity_type=task&entity_id=xxx
 * Returns all links for a given entity (from both directions).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
}

/**
 * POST /api/entity-links
 * Create a new entity link.
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

  const { source_type, source_id, target_type, target_id, link_type, sync_completion } = body;

  // Validate required fields
  if (!source_type || !source_id || !target_type || !target_id || !link_type) {
    return NextResponse.json(
      { error: "source_type, source_id, target_type, target_id, and link_type are required" },
      { status: 400 }
    );
  }

  // Validate enum values
  if (!VALID_ENTITY_TYPES.includes(source_type)) {
    return NextResponse.json(
      { error: `Invalid source_type. Must be one of: ${VALID_ENTITY_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!VALID_ENTITY_TYPES.includes(target_type)) {
    return NextResponse.json(
      { error: `Invalid target_type. Must be one of: ${VALID_ENTITY_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!VALID_LINK_TYPES.includes(link_type)) {
    return NextResponse.json(
      { error: `Invalid link_type. Must be one of: ${VALID_LINK_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Prevent self-linking
  if (source_type === target_type && source_id === target_id) {
    return NextResponse.json({ error: "Cannot link an entity to itself" }, { status: 400 });
  }

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

  return NextResponse.json({ link: data }, { status: 201 });
}

/**
 * DELETE /api/entity-links?id=xxx
 * Remove an entity link.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await platform(supabase)
    .from("entity_links")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
