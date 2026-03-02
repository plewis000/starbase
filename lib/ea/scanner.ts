/**
 * EA Gmail Scanner
 *
 * Fetches new emails from Gmail since last scan using the Gmail MCP tools.
 * Since we're running server-side (cron / API route), we call the Gmail API
 * via the Anthropic client with tool_use to leverage the MCP connection.
 *
 * In practice, the scanner is called from an API route that has access to
 * the Gmail MCP. The scanner itself works with the raw email data structure.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { ea } from "@/lib/supabase/schemas";
import type { ScanState } from "./types";

// Raw email shape from Gmail MCP search_messages / read_message
export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
  };
  labelIds?: string[];
}

export interface ParsedEmail {
  gmail_message_id: string;
  gmail_thread_id: string;
  received_at: string;
  sender: string;
  subject: string | null;
  snippet: string | null;
}

/**
 * Parse Gmail message headers into a flat structure
 */
export function parseGmailMessage(msg: GmailMessage): ParsedEmail {
  const headers = msg.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || null;

  return {
    gmail_message_id: msg.id,
    gmail_thread_id: msg.threadId,
    received_at: new Date(parseInt(msg.internalDate) || Date.now()).toISOString(),
    sender: getHeader("From") || "unknown",
    subject: getHeader("Subject"),
    snippet: msg.snippet || null,
  };
}

/**
 * Get the last scan timestamp
 */
export async function getLastScanTime(): Promise<ScanState> {
  const supabase = createServiceClient();
  const { data } = await ea(supabase)
    .from("scan_state")
    .select("*")
    .eq("id", "default")
    .single();

  return (
    data || {
      id: "default",
      last_scan_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      last_history_id: null,
      emails_processed: 0,
    }
  );
}

/**
 * Update scan state after processing
 */
export async function updateScanState(processed: number): Promise<void> {
  const supabase = createServiceClient();
  await ea(supabase)
    .from("scan_state")
    .upsert({
      id: "default",
      last_scan_at: new Date().toISOString(),
      emails_processed: processed,
    });
}

/**
 * Filter out emails we've already processed
 */
export async function filterAlreadyProcessed(
  messageIds: string[]
): Promise<string[]> {
  if (messageIds.length === 0) return [];

  const supabase = createServiceClient();
  const { data: existing } = await ea(supabase)
    .from("email_signals")
    .select("gmail_message_id")
    .in("gmail_message_id", messageIds);

  const existingIds = new Set((existing || []).map((e: { gmail_message_id: string }) => e.gmail_message_id));
  return messageIds.filter((id) => !existingIds.has(id));
}

/**
 * Build Gmail search query for new emails since last scan.
 * Excludes drafts and sent mail (only inbox/updates/primary).
 */
export function buildSearchQuery(since: Date): string {
  // Gmail search format: after:YYYY/MM/DD
  const y = since.getFullYear();
  const m = String(since.getMonth() + 1).padStart(2, "0");
  const d = String(since.getDate()).padStart(2, "0");
  return `after:${y}/${m}/${d} in:inbox`;
}
