import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { config } from "@/lib/supabase/schemas";

// =============================================================
// GET /api/tags — List all active tags
// =============================================================
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: tags, error } = await config(supabase)
    .from("tags")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tags: tags || [] });
}

// =============================================================
// POST /api/tags — Create a new tag
// =============================================================
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tag }, { status: 201 });
}
