import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { platform } from "@/lib/supabase/schemas";

// GET /api/user/preferences?keys=key1,key2
export const GET = withUser(async (request: NextRequest, { supabase, user }) => {
  const keys = request.nextUrl.searchParams.get("keys");

  let query = platform(supabase)
    .from("user_preferences")
    .select("preference_key, preference_value")
    .eq("user_id", user.id);

  if (keys) {
    const keyList = keys.split(",").map((k) => k.trim()).filter(Boolean);
    if (keyList.length > 0) {
      query = query.in("preference_key", keyList);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const preferences: Record<string, unknown> = {};
  for (const row of data || []) {
    preferences[row.preference_key] = row.preference_value;
  }

  return NextResponse.json({ preferences });
});

// PUT /api/user/preferences — upsert a single preference
export const PUT = withUser(async (request: NextRequest, { supabase, user }) => {
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { key, value } = body;
  if (!key || typeof key !== "string" || key.length > 100) {
    return NextResponse.json({ error: "key is required (string, max 100 chars)" }, { status: 400 });
  }

  if (value === undefined) {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }

  const { error } = await platform(supabase)
    .from("user_preferences")
    .upsert(
      {
        user_id: user.id,
        preference_key: key,
        preference_value: value,
      },
      { onConflict: "user_id,preference_key" }
    );

  if (error) {
    console.error(error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
});
