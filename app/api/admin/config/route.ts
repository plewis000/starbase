import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { config, platform } from "@/lib/supabase/schemas";

const VALID_TABLES = [
  "task_statuses",
  "task_priorities",
  "task_types",
  "effort_levels",
  "location_contexts",
  "goal_categories",
  "goal_timeframes",
  "habit_frequencies",
  "habit_time_preferences",
  "shopping_categories",
] as const;

type ConfigTable = typeof VALID_TABLES[number];

async function isAdmin(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, userId: string): Promise<boolean> {
  const { data } = await platform(supabase)
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role === "admin";
}

// GET /api/admin/config?table=task_statuses — List all rows for a config table
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const table = request.nextUrl.searchParams.get("table");

  if (!table || !VALID_TABLES.includes(table as ConfigTable)) {
    return NextResponse.json({
      error: `Invalid table. Valid tables: ${VALID_TABLES.join(", ")}`,
    }, { status: 400 });
  }

  const validTable = table as ConfigTable;
  const { data: rows, error } = await config(supabase)
    .from(validTable)
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ table, rows: rows || [] });
}

// POST /api/admin/config — Create a new config row
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { table, ...rowData } = body;

  if (!table || !VALID_TABLES.includes(table as ConfigTable)) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  if (!rowData.name || typeof rowData.name !== "string" || !rowData.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data: row, error } = await config(supabase)
    .from(table)
    .insert({
      name: rowData.name.trim(),
      display_color: rowData.display_color || null,
      icon: rowData.icon || null,
      sort_order: rowData.sort_order ?? 0,
      active: rowData.active ?? true,
      ...(rowData.slug ? { slug: rowData.slug } : {}),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ row }, { status: 201 });
}

// PATCH /api/admin/config — Update a config row
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { table, id, ...updates } = body;

  if (!table || !VALID_TABLES.includes(table as ConfigTable)) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const safeUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) safeUpdates.name = typeof updates.name === "string" ? updates.name.trim() : String(updates.name);
  if (updates.display_color !== undefined) safeUpdates.display_color = updates.display_color || null;
  if (updates.icon !== undefined) safeUpdates.icon = updates.icon || null;
  if (updates.sort_order !== undefined) safeUpdates.sort_order = updates.sort_order;
  if (updates.active !== undefined) safeUpdates.active = updates.active;
  if (updates.slug !== undefined) safeUpdates.slug = updates.slug;

  const { data: row, error } = await config(supabase)
    .from(table)
    .update(safeUpdates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ row });
}
