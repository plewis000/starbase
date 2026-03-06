import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { config } from "@/lib/supabase/schemas";

// =============================================================
// GET /api/tags — List all active tags
// =============================================================
export const GET = withUser(async (_request, { supabase }) => {
  const { data: tags, error } = await config(supabase)
    .from("tags")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  if (error) {
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ tags: tags || [] });
});

// =============================================================
// POST /api/tags — Create a new tag
// =============================================================
export const POST = withUser(async (request: NextRequest, { supabase, user }) => {
  let body;

  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { name, display_color, icon } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Generate slug from name
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { data: tag, error } = await config(supabase)
    .from("tags")
    .insert({
      name: name.trim(),
      slug,
      display_color: display_color || null,
      icon: icon || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A tag with this name already exists" },
        { status: 409 }
      );
    }
    console.error(error.message); return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ tag }, { status: 201 });
});
