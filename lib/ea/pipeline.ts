/**
 * EA Pipeline — Orchestrator
 *
 * The main entry point for running the EA pipeline:
 * 1. Scan Gmail for new emails (via MCP tools from the API route)
 * 2. Filter already-processed emails
 * 3. Classify (rules + AI)
 * 4. Generate brief
 * 5. Deliver via Discord
 * 6. Store signals + brief
 *
 * Called from:
 * - /api/cron/ea-brief (daily 8am PST trigger)
 * - /api/ea/brief (on-demand via /brief slash command)
 */

import { loadClassifierConfig, classifyEmails, clearClassifierCache } from "./classifier";
import { filterAlreadyProcessed, updateScanState, type ParsedEmail } from "./scanner";
import { generateBrief, storeBrief, storeEmailSignals } from "./brief-generator";
import { sendMessage } from "@/lib/discord";
import type { GeneratedBrief } from "./types";

export interface PipelineResult {
  success: boolean;
  emails_scanned: number;
  emails_new: number;
  emails_classified: number;
  brief_items: number;
  suppressed: number;
  brief_id: string | null;
  error?: string;
}

/**
 * Run the full EA pipeline.
 *
 * @param parsedEmails - Pre-parsed emails from Gmail MCP (the API route handles fetching)
 * @param briefType - "daily" | "on_demand" | "weekly"
 * @param discordChannelId - Channel to deliver the brief to
 */
export async function runPipeline(
  parsedEmails: ParsedEmail[],
  briefType: "daily" | "on_demand" | "weekly" = "daily",
  discordChannelId?: string,
): Promise<PipelineResult> {
  try {
    // Step 1: Filter already-processed
    const allIds = parsedEmails.map((e) => e.gmail_message_id);
    const newIds = await filterAlreadyProcessed(allIds);
    const newEmails = parsedEmails.filter((e) => newIds.includes(e.gmail_message_id));

    if (newEmails.length === 0) {
      return {
        success: true,
        emails_scanned: parsedEmails.length,
        emails_new: 0,
        emails_classified: 0,
        brief_items: 0,
        suppressed: 0,
        brief_id: null,
      };
    }

    // Step 2: Load classifier config + classify
    await loadClassifierConfig();
    const classified = await classifyEmails(newEmails);
    clearClassifierCache();

    // Step 3: Generate brief
    const brief = await generateBrief(classified, briefType);

    // Step 4: Store brief + signals
    const briefId = await storeBrief(brief);
    await storeEmailSignals(classified, briefId);

    // Step 5: Deliver via Discord
    if (discordChannelId && brief.discord_text) {
      await sendMessage(discordChannelId, brief.discord_text);
    }

    // Step 6: Update scan state
    await updateScanState(parsedEmails.length);

    return {
      success: true,
      emails_scanned: parsedEmails.length,
      emails_new: newEmails.length,
      emails_classified: classified.length,
      brief_items: brief.items.length,
      suppressed: brief.suppressed_count,
      brief_id: briefId,
    };
  } catch (err) {
    console.error("[ea/pipeline] Pipeline failed:", err);
    return {
      success: false,
      emails_scanned: parsedEmails.length,
      emails_new: 0,
      emails_classified: 0,
      brief_items: 0,
      suppressed: 0,
      brief_id: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
