/**
 * Mention parser — extracts @mentions from comment text and resolves to user IDs.
 *
 * Patterns recognized:
 *   @display_name  (matches against platform.users.display_name)
 *   @email         (matches against platform.users.email)
 *
 * Usage: call parseMentions() after creating a comment to extract + persist mentions.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { platform } from "@/lib/supabase/schemas";

// ---- Types ----

export interface ParsedMention {
  raw: string;           // The raw matched text (e.g., "@john.doe")
  identifier: string;    // Cleaned identifier (e.g., "john.doe")
  userId: string | null; // Resolved user ID (null if unresolved)
}

export interface MentionResult {
  mentions: ParsedMention[];
  resolvedUserIds: string[];  // Deduped user IDs that were successfully resolved
}

// ---- Constants ----

// Match @word where word can contain letters, numbers, dots, hyphens, underscores, and @ for emails
// Stops at whitespace, punctuation (except . - _ @), or end of string
const MENTION_REGEX = /@([\w][\w.@-]{0,100})/g;

// ---- Core Parser ----

/**
 * Extract @mention patterns from text.
 * Returns raw parsed mentions (not yet resolved to user IDs).
 */
export function extractMentions(text: string): string[] {
  if (!text || typeof text !== "string") return [];

  const matches: string[] = [];
  let match: RegExpExecArray | null;

  // Reset regex
  MENTION_REGEX.lastIndex = 0;

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const identifier = match[1].replace(/\.$/, ""); // Strip trailing dot
    if (identifier.length >= 2) { // Minimum 2 chars
      matches.push(identifier);
    }
  }

  // Deduplicate
  return [...new Set(matches)];
}

/**
 * Resolve mention identifiers to user IDs.
 * Looks up by display_name (case-insensitive) and email.
 */
export async function resolveMentions(
  supabase: SupabaseClient,
  identifiers: string[]
): Promise<Map<string, string>> {
  if (identifiers.length === 0) return new Map();

  const resolved = new Map<string, string>();

  // Batch lookup: try display_name match first, then email
  const { data: users } = await platform(supabase)
    .from("users")
    .select("id, display_name, email")
    .or(
      identifiers
        .map((id) => `display_name.ilike.${id},email.ilike.${id}`)
        .join(",")
    );

  if (users) {
    for (const user of users) {
      for (const identifier of identifiers) {
        const lower = identifier.toLowerCase();
        if (
          (user.display_name && user.display_name.toLowerCase() === lower) ||
          (user.email && user.email.toLowerCase() === lower)
        ) {
          resolved.set(identifier, user.id);
        }
      }
    }
  }

  return resolved;
}

/**
 * Full pipeline: parse text, resolve users, return structured results.
 */
export async function parseMentions(
  supabase: SupabaseClient,
  text: string
): Promise<MentionResult> {
  const identifiers = extractMentions(text);

  if (identifiers.length === 0) {
    return { mentions: [], resolvedUserIds: [] };
  }

  const resolvedMap = await resolveMentions(supabase, identifiers);

  const mentions: ParsedMention[] = identifiers.map((id) => ({
    raw: `@${id}`,
    identifier: id,
    userId: resolvedMap.get(id) || null,
  }));

  const resolvedUserIds = [...new Set(
    mentions
      .filter((m) => m.userId !== null)
      .map((m) => m.userId as string)
  )];

  return { mentions, resolvedUserIds };
}

/**
 * Persist mentions to the database.
 * Call after creating a comment to store mention records.
 */
export async function persistMentions(
  supabase: SupabaseClient,
  commentId: string,
  entityType: string,
  entityId: string,
  resolvedUserIds: string[]
): Promise<{ success: boolean; error?: string }> {
  if (resolvedUserIds.length === 0) return { success: true };

  const rows = resolvedUserIds.map((userId) => ({
    comment_id: commentId,
    mentioned_user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
  }));

  const { error } = await platform(supabase)
    .from("mentions")
    .insert(rows);

  if (error) {
    console.error("Failed to persist mentions:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
