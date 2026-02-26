# Starbase — Decisions Log

Extracted during Sisyphus import (Session 3, 2026-02-26). Decisions mined from codebase, git history, existing docs, and FAILURE_LOG.

---

### D-001: Custom PostgreSQL Schemas (Not Public)
**Category:** Data
**Decision:** Use 4 custom schemas (platform, config, household, finance) instead of the default `public` schema.
**Evidence:** `supabase/migrations/001_initial_schema.sql` — `CREATE SCHEMA IF NOT EXISTS platform; config; household; finance;`
**Alternatives rejected:** Single public schema (simpler but no domain isolation), schema-per-module (too many schemas)
**Implications:** Requires exposing schemas in Supabase API settings. PostgREST FK joins break across schemas (led to F-001, F-002 and the enrichment pattern). All queries must use schema helpers (`platform()`, `config()`).
**Confidence:** 🟢 — Intentional and documented in CODEBASE_MAP

### D-002: Application-Level Cross-Schema Enrichment
**Category:** Architecture
**Decision:** Resolve cross-schema FK references in application code (Maps-based O(1) lookup) instead of database views or functions.
**Evidence:** `lib/task-enrichment.ts` — `getConfigLookups()`, `enrichTasks()`
**Alternatives rejected:** Database views (Supabase doesn't expose views well), PostgREST FK hints (don't work cross-schema), SQL JOINs in stored procedures (adds DB complexity)
**Implications:** Every GET endpoint must call enrichment. Adds ~5 parallel queries per request. Trades DB complexity for application clarity.
**Confidence:** 🟢 — Forced by PostgREST limitation, well-implemented

### D-003: Config Tables for All Lookup Data
**Category:** Data
**Decision:** Every user-facing option (statuses, priorities, types, efforts, domains, tags, etc.) stored in `config.*` tables with standard structure (id, name, display_color, icon, sort_order, active).
**Evidence:** `supabase/migrations/001_initial_schema.sql` — 14+ config tables. `CONFIGURABILITY_STANDARDS.md` locks this pattern.
**Alternatives rejected:** TypeScript enums (hardcoded), JSON files (no admin UI), environment variables (not user-manageable)
**Implications:** No code changes needed to add/modify options. Admin panel required for management. Seeds must exist for initial load.
**Confidence:** 🟢 — Locked standard

### D-004: Supabase OAuth with Google Provider
**Category:** Auth
**Decision:** Google OAuth via Supabase auth, enforced by Next.js middleware on all routes.
**Evidence:** `middleware.ts`, `app/auth/callback/route.ts`, `app/login/page.tsx`
**Alternatives rejected:** Magic link (simpler but email-dependent), passphrase (less secure), custom auth (unnecessary complexity)
**Implications:** Requires Google Cloud OAuth credentials. Preview deployments need wildcard redirect URLs in Supabase allowlist.
**Confidence:** 🟢 — Intentional, matches Google-native preference

### D-005: Middleware-Enforced Auth (Single Gate)
**Category:** Auth
**Decision:** All route protection handled by a single middleware check rather than per-route auth guards.
**Evidence:** `middleware.ts` — catches all routes, redirects unauthenticated to `/login`
**Alternatives rejected:** Per-route auth checks (duplicative, easy to miss), API-only auth (leaves pages unprotected)
**Implications:** Simple, consistent. Every new route is automatically protected. Login page explicitly excluded.
**Confidence:** 🟢 — Standard Next.js pattern

### D-006: Activity Logging on Every Mutation
**Category:** Architecture
**Decision:** Every POST, PATCH, DELETE logs to `platform.activity_log` with entity type, action, field-level changes, and performer.
**Evidence:** `lib/activity-log.ts` — `logActivity()`, `logFieldChanges()`. Called in every mutation route.
**Alternatives rejected:** No logging (no audit trail), Supabase triggers (less control over format), external logging service (overkill)
**Implications:** Activity log grows with usage. Field-level change tracking enables undo/history features later.
**Confidence:** 🟢 — Locked in COMPRESSION_ANCHORS (rule #9)

### D-007: Non-Blocking Notification Dispatch
**Category:** Architecture
**Decision:** Notifications dispatched with `.catch(console.error)` — failures logged but don't break the API response.
**Evidence:** `lib/notify.ts` — all `triggerNotification()` calls wrapped in `.catch()`
**Alternatives rejected:** Synchronous notifications (blocks response), queue system (overkill for 2-user app), retry logic (unnecessary complexity)
**Implications:** Notification failures are silent. Users won't see errors, but also won't see missed notifications. Acceptable for a personal tool.
**Confidence:** 🟢 — Intentional tradeoff

### D-008: Custom RRULE Parser for Recurrence
**Category:** Architecture
**Decision:** Lightweight custom recurrence engine parsing RRULE strings (Daily, Weekly, Monthly, Yearly) instead of using a full RFC 5545 library.
**Evidence:** `lib/recurrence.ts` — `getNextOccurrence()`, `lib/recurrence-engine.ts` — `createNextRecurrence()`
**Alternatives rejected:** rrule.js library (large, complex), no recurrence (missing core feature), Supabase cron (wrong layer)
**Implications:** Covers ~95% of household use cases. Complex patterns (e.g., "3rd Wednesday of every month") not supported. Can upgrade to rrule.js later if needed.
**Confidence:** 🟡 — Works for current needs, may need upgrade for advanced patterns

### D-009: Recurrence Creates New Task on Completion
**Category:** Architecture
**Decision:** When a recurring task is marked Done, the system automatically creates the next instance (new task with next due date, copied relations).
**Evidence:** `app/api/tasks/[id]/route.ts` PATCH handler — calls `createNextRecurrence()` when status changes to Done
**Alternatives rejected:** Pre-generate all instances (calendar clutter), prompt user to create next (friction), modify existing task date (loses history)
**Implications:** Each completion creates a new row. History preserved per-instance. Recurrence chain linked via metadata.
**Confidence:** 🟢 — Clean pattern, preserves history

### D-010: Dark-First UI Theme
**Category:** Frontend
**Decision:** Tailwind dark theme as default. slate-950 background, slate-900 cards, green-400 accents.
**Evidence:** `tailwind.config.ts`, `app/layout.tsx`, all component files
**Alternatives rejected:** Light theme (user preference), system-follows-OS (complexity), theme toggle (deferred)
**Implications:** All new components must follow dark palette. Light mode toggle is a future feature.
**Confidence:** 🟢 — User preference

### D-011: No Client-Side State Library
**Category:** Frontend
**Decision:** React hooks (useState, useEffect) only. No Redux, Zustand, or similar.
**Evidence:** All components use local state. No state library in package.json.
**Alternatives rejected:** Zustand (simplest lib option), Redux (overkill), React Context (would be fine but not needed yet)
**Implications:** State is local to each component. No global task cache. Each page fetch is independent. May need state library if UI becomes more complex.
**Confidence:** 🟡 — Fine for now, may need revisiting as features grow

### D-012: QA Suite Over Unit Tests
**Category:** Testing
**Decision:** Static analysis linting scripts (5 QA checks) instead of traditional unit/integration tests.
**Evidence:** `qa/` folder — 6 scripts checking for known anti-patterns
**Alternatives rejected:** Jest unit tests (high maintenance for changing codebase), Playwright e2e (setup overhead), no QA (unacceptable)
**Implications:** QA catches pattern violations but not runtime bugs. No regression testing for business logic. Acceptable for current velocity.
**Confidence:** 🟡 — Effective for known patterns, doesn't catch new bug categories

### D-013: Soft Delete via Archive Status
**Category:** Data
**Decision:** Task deletion sets status to "Archived" (soft delete) rather than removing the row.
**Evidence:** `app/api/tasks/[id]/route.ts` DELETE handler
**Alternatives rejected:** Hard delete (data loss), separate archive table (schema complexity), tombstone flag (another column)
**Implications:** Archived tasks still exist in DB. Filters must exclude archived. Unarchive is trivial.
**Confidence:** 🟢 — Standard pattern

### D-014: UUID Primary Keys Everywhere
**Category:** Data
**Decision:** All tables use `UUID PRIMARY KEY DEFAULT gen_random_uuid()`. No integer sequences.
**Evidence:** Every CREATE TABLE in migrations
**Alternatives rejected:** Auto-increment integers (sequential ID leakage, environment-dependent)
**Implications:** Stable across environments. Safe to share externally. Locked in CODE_QUALITY standard.
**Confidence:** 🟢 — Locked standard

### D-015: Source Field on Entity Tables
**Category:** Data
**Decision:** Every entity table has `source TEXT NOT NULL DEFAULT 'manual'` to track where records come from.
**Evidence:** `platform.tasks` — `source TEXT NOT NULL DEFAULT 'manual'`
**Alternatives rejected:** No source tracking (lose provenance), separate provenance table (over-engineering)
**Implications:** Enables multi-source ingestion (manual, discord, home_assistant, claude, system) without schema changes.
**Confidence:** 🟢 — Locked in CODE_QUALITY standard

---

## Summary

| Category | Count | High Confidence | Medium Confidence |
|----------|-------|----------------|-------------------|
| Architecture | 5 | 4 | 1 |
| Data | 4 | 4 | 0 |
| Auth | 2 | 2 | 0 |
| Frontend | 2 | 1 | 1 |
| Testing | 1 | 0 | 1 |
| **Total** | **15** | **12** | **3** |
