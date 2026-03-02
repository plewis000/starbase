/**
 * Executive Assistant Module
 *
 * Email intelligence layer for Parker's personal Gmail.
 * Classifies emails, generates daily briefs, learns preferences.
 *
 * Architecture:
 * - lib/ea/types.ts        — Type definitions matching ea.* schema
 * - lib/ea/classifier.ts   — Email classification (rules + AI)
 * - lib/ea/scanner.ts      — Gmail inbox scanning
 * - lib/ea/brief-generator.ts — Brief formatting and storage
 * - lib/ea/pipeline.ts     — Orchestrator (scan → classify → brief → deliver)
 *
 * API Routes:
 * - app/api/cron/ea-brief/  — Daily 8 AM PT cron trigger
 * - app/api/ea/brief/       — On-demand brief via internal API
 *
 * Discord:
 * - /brief command          — On-demand brief via Zev
 *
 * Database:
 * - ea.sender_profiles      — Per-sender importance weights (seeded)
 * - ea.category_config      — Category-level weights and display prefs
 * - ea.explicit_rules       — User-defined hard rules
 * - ea.email_signals        — Processed email records
 * - ea.briefs               — Brief history with feedback
 * - ea.reminders            — Urgency-based follow-up tracking
 * - ea.lenale_messages      — Messages sent to Lenale
 * - ea.draft_history        — Email drafts and user feedback
 * - ea.scan_state           — Last inbox scan position
 */

export { classifyEmails, loadClassifierConfig } from "./classifier";
export { buildSearchQuery, getLastScanTime, updateScanState } from "./scanner";
export { generateBrief, storeBrief, storeEmailSignals } from "./brief-generator";
export { runPipeline } from "./pipeline";
export type * from "./types";
