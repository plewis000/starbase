/**
 * EA Pipeline — Orchestrator
 *
 * The main entry point for running the EA pipeline:
 * 1. Filter already-processed emails
 * 2. Classify (rules + AI)
 * 3. Generate brief
 * 4. Deliver via Discord
 * 5. Store signals + brief
 */

import { classifyEmails } from "./classifier";
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

export async function runPipeline(
  parsedEmails: ParsedEmail[],
  briefType: "daily" | "on_demand" | "weekly" = "daily",
  discordChannelId?: string,
): Promise<PipelineResult> {
  try {
    // Step 1: Filter already-processed
    const allIds = parsedEmails.map((e) => e.gmail_message_id);
    const newIdSet = new Set(await filterAlreadyProcessed(allIds));
    const newEmails = parsedEmails.filter((e) => newIdSet.has(e.gmail_message_id));

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

    // Step 2: Classify
    const classified = await classifyEmails(newEmails);

    // Step 3: Generate brief
    const brief = await generateBrief(classified, briefType);

    // Step 4: Store brief
    const briefId = await storeBrief(brief);

    // Step 5: Store signals with correct was_surfaced flag
    const surfacedIds = new Set(brief.items.map((item) => item.signal_id));
    await storeEmailSignals(classified, briefId, surfacedIds);

    // Step 6: Deliver via Discord
    if (discordChannelId && brief.discord_text) {
      await sendMessage(discordChannelId, brief.discord_text);
    }

    // Step 7: Update scan state
    await updateScanState(newEmails.length);

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
