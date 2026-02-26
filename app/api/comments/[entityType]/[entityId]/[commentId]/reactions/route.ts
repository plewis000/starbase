import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platform } from "@/lib/supabase/schemas";
import { safeParseBody, isValidUUID, validateRequiredString } from "@/lib/validation";

// ---- POST: Add a reaction ----

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string; commentId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { commentId } = await params;
  if (!isValidUUID(commentId)) return NextResponse.json({ error: "Invalid comment ID" }, { status: 400 });

  const parsed = await safeParseBody(request);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const emojiCheck = validateRequiredString(parsed.body.emoji, "emoji", 20);
  if (!emojiCheck.valid) return NextResponse.json({ error: emojiCheck.error }, { status: 400 });

  // Verify comment exists
  const { data: comment } = await platform(supabase)
    .from("comments")
    .select("id")
    .eq("id", commentId)
    .eq("is_deleted", false)
    .single();

  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  // Upsert reaction (unique constraint handles duplicates)
  const { data: reaction, error } = await platform(supabase)
    .from("reactions")
    .upsert(
      {
        comment_id: commentId,
        user_id: user.id,
        emoji: emojiCheck.value,
      },
      { onConflict: "comment_id,user_id,emoji" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reaction }, { status: 201 });
}

// ---- DELETE: Remove a reaction ----

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string; commentId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { commentId } = await params;
  if (!isValidUUID(commentId)) return NextResponse.json({ error: "Invalid comment ID" }, { status: 400 });

  const emoji = request.nextUrl.searchParams.get("emoji");
  if (!emoji || emoji.length > 20) {
    return NextResponse.json({ error: "emoji query parameter is required" }, { status: 400 });
  }

  const { error } = await platform(supabase)
    .from("reactions")
    .delete()
    .eq("comment_id", commentId)
    .eq("user_id", user.id)
    .eq("emoji", emoji);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
