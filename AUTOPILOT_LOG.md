# Autopilot Session — 2026-03-01
**Branch:** autopilot/executive-assistant
**Target:** Starbase (Executive Assistant module)
**Scope:** Constrained: Build EA Phase 1 — email intelligence pipeline
**PRs Created:** 0 (in progress)

## Strategic Decisions Made (Parker granted autonomy for tonight)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| SD-1 | EA schema namespace | New `ea` schema (not extending platform/config) | Follows existing pattern (platform, config, household, finance → ea). Clean separation. |
| SD-2 | 9 tables (not 6) | Added `scan_state`, `reminders`, `lenale_messages` beyond original 6 | scan_state needed for incremental inbox sync, reminders and lenale_messages were in PROJECT_PLAN but missing from original data model |
| SD-3 | Classifier: 2-pass (rules + AI) | Rules first (sender_profiles + explicit_rules), then Haiku for unknowns | ~70% of emails classified without any API cost. AI only for unknowns. |
| SD-4 | Brief format: structured, not AI-generated | Discord brief is template-formatted (urgency sections), not Claude-narrated | Faster, cheaper, more consistent. AI narration can be added later as enhancement. |
| SD-5 | Cron at 3 PM UTC (8 AM PT) | Matches PROJECT_PLAN.md D4 (daily brief at 8am PST) | PT not PST — 3 PM UTC works for both. |
| SD-6 | `/brief` command added to Zev | Extends existing slash command set | Reuses all existing Discord infrastructure. No separate bot. |
| SD-7 | EA API routes use PIPELINE_SECRET auth | Same auth pattern as other internal routes | Consistent, already deployed. |
| SD-8 | Gmail fetch is a placeholder | Cron route has TODO for direct Gmail API | MCP tools are session-scoped (can't call from cron). Need OAuth or service account. Logged as known limitation. |
| SD-9 | Middleware exclusion for api/ea | Added to matcher regex | Same pattern as api/pipeline, api/discord. (P023) |

## Task 1: Schema + Seed Data (Phase 1A)
- **Mode:** ARCHITECT → DEVELOPER
- **What:** Created 2 migrations (013_executive_assistant.sql, 014_ea_seed_data.sql) with 9 tables and full seed data from INBOX_CLASSIFICATION.md
- **Why:** Foundation for entire EA module. Seed data gives ~55-60% accuracy from day 1.
- **Files:**
  - `supabase/migrations/013_executive_assistant.sql`
  - `supabase/migrations/014_ea_seed_data.sql`
  - `lib/supabase/schemas.ts` (added `ea` helper)
- **Confidence:** 🟢 90%
- **Build:** PASS (tsc --noEmit = exit 0)

## Task 2: Classification Engine (Phase 1B)
- **Mode:** DEVELOPER
- **What:** Built 2-pass email classifier (rules + AI), Gmail scanner, deduplication
- **Why:** Core intelligence — this is what makes the brief smart, not just a list of emails
- **Files:**
  - `lib/ea/types.ts` — Full type system matching schema
  - `lib/ea/classifier.ts` — Rule-based + Haiku AI classification
  - `lib/ea/scanner.ts` — Gmail scanning, dedup filtering, scan state management
- **Confidence:** 🟢 85%
- **Build:** PASS

## Task 3: Brief Generation + Delivery (Phase 1C)
- **Mode:** DEVELOPER
- **What:** Brief generator (dedup → rank → format), pipeline orchestrator, cron route, API route, Discord command
- **Why:** The user-facing output — this is what Parker sees every morning
- **Files:**
  - `lib/ea/brief-generator.ts` — Dedup, ranking, Discord formatting
  - `lib/ea/pipeline.ts` — Full pipeline orchestrator
  - `lib/ea/index.ts` — Module exports
  - `app/api/cron/ea-brief/route.ts` — 8 AM PT daily trigger
  - `app/api/ea/brief/route.ts` — On-demand API endpoint
  - `app/api/discord/route.ts` — Added /brief command handler
  - `lib/discord.ts` — Added /brief slash command registration
  - `middleware.ts` — Added api/ea to exclusion list
  - `vercel.json` — Added ea-brief cron entry
- **Confidence:** 🟡 75% (Gmail fetch not wired yet — placeholder)
- **Build:** PASS

## Known Gaps
1. **Gmail fetch from cron** — MCP tools are session-scoped. The cron route can't call Gmail MCP directly. Need either:
   - Direct Gmail API with OAuth refresh token stored in Supabase
   - Or: have Sisyphus CLI run the scan and post results to the API
   - Decision deferred — this is the critical path item for the brief to actually work
2. **Supabase schema exposure** — The `ea` schema needs to be added to Supabase Dashboard > Settings > API > Exposed schemas
3. **EA_CHANNEL_ID env var** — Need a dedicated Discord channel for EA briefs (or reuse PIPELINE_CHANNEL_ID)
4. **Discord command re-registration** — Need to hit POST /api/discord/setup to register the new /brief command
5. **Migration not yet applied** — Migrations written but not yet run against Supabase

## Session Summary (in progress)
- **Tasks completed:** 3 (schema, classifier, brief gen)
- **PRs created:** 0 (will create after QA pass)
- **High-value work remaining:** Yes — Gmail fetch, migration apply, E2E test, QA
- **Blocked tasks:** Gmail cron fetch (needs OAuth decision)
- **Waterfall position:** Priority 1 (parking lot item: EA project)
- **Diminishing returns reached:** No
