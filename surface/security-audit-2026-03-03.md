# Security Audit Report — Starbase (Desperado Club)
Date: 2026-03-03
Auditor: Sisyphus (automated)

## Summary Dashboard
| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 2 |
| MEDIUM | 4 |
| LOW | 1 |
| INFO | 4 |

---

## CRITICAL Findings

### C1: RLS Policies Are `USING (true)` Across All Data Tables
**Where:** `supabase/migrations/001_initial_schema.sql`, `002_task_engine_extended.sql`, `003_goals_habits.sql`, `005_agentic_platform.sql`, `006_gamification.sql`, `007_agentic_infrastructure.sql`, `013_entity_links.sql`, `014_ea_schema.sql`

**What:** Nearly every RLS policy in the database uses `USING (true)` — meaning any authenticated user can read and write ALL rows in ALL tables, regardless of household membership. This includes:

- `platform.tasks` — SELECT and ALL: `USING (true)`
- `platform.users` — SELECT: `USING (true)`
- `platform.people` — SELECT and ALL: `USING (true)`
- `platform.files` — SELECT and ALL: `USING (true)`
- `household.shopping_lists` — SELECT and ALL: `USING (true)`
- `household.shopping_items` — SELECT and ALL: `USING (true)`
- `platform.task_comments`, `task_dependencies`, `task_checklist_items`, `task_tags`, `task_templates`, `activity_log`, `automation_log`, `assignment_rotations` — ALL: `USING (true)`
- All gamification tables — `USING (true)`
- All agentic infrastructure tables — `USING (true)`
- Entity links — SELECT: `USING (true)`
- EA schema — ALL: `USING (true)`

**Impact:** Currently mitigated because the API layer enforces household scoping via `getHouseholdContext()` + `getHouseholdMemberIds()`. However:
1. Any direct Supabase client access (e.g., from browser JS using the anon key) bypasses API route guards entirely
2. If any API route forgets the household filter, data leaks across households
3. The `supabase-js` client library used in components could theoretically query cross-household

**Risk level now:** MEDIUM (single household, Parker + Lenale only). **Risk at scale:** CRITICAL (multi-household / public launch).

**Recommended fix:** Add `household_id` column to all user-facing tables and update RLS policies to:
```sql
USING (household_id = (SELECT household_id FROM platform.household_members WHERE user_id = auth.uid()))
```

This is Locked Decision #53: "Public app far future, build secure now." The "build secure now" part isn't happening at the RLS layer.

---

## HIGH Findings

### H1: No Rate Limiting on Any API Route
**Where:** All 90+ API routes in `app/api/`

**What:** Zero rate limiting found. No middleware-level throttling, no per-route rate limits, no library imports for rate limiting (`ratelimit`, `throttle`, etc.).

**Impact:** Any authenticated user (or attacker with a valid session) can:
- Hammer the API with unlimited requests
- Trigger unlimited AI agent calls (`/api/agent`) which cost real money (Anthropic API)
- Create unlimited tasks/habits/goals to bloat the database
- Exhaust Supabase connection pool

**Recommended fix:** Add rate limiting middleware, at minimum for:
1. `/api/agent` — AI calls are expensive (~$0.05-0.50 per call)
2. `/api/pipeline/*` — deployment pipeline
3. Auth-related flows (login attempts are handled by Supabase, but API abuse is not)

Consider `@upstash/ratelimit` (works well with Vercel edge) or `next-rate-limit`.

### H2: `pipeline/verify` Route Missing Household Scope Check
**Where:** `app/api/pipeline/verify/route.ts`

**What:** Unlike `pipeline/approve` which explicitly checks `feedback.household_id !== ctx.household_id`, the `verify` route does not verify that the feedback item belongs to the requesting admin's household. An admin from household A could theoretically approve/reject a code deployment for household B if they know the UUID.

Also leaks GitHub API error messages (`Failed to merge PR: ${e.message}`) which could expose repo names, branch names, and API details.

**Recommended fix:** Add the same household check from `pipeline/approve`:
```typescript
if (feedback.household_id !== ctx.household_id) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

---

## MEDIUM Findings

### M1: Supabase Error Messages Leaked to Client
**Where:** Multiple API routes

**What:** At least 5 routes return raw `error.message` from Supabase to the client:
- `app/api/shopping/route.ts` (lines 24, 77)
- `app/api/habits/route.ts` (line 43)
- `app/api/pipeline/approve/route.ts` (line 70)
- `app/api/pipeline/verify/route.ts` (lines 99-100)
- `app/api/plaid/webhook/route.ts` (line 71)

**Impact:** Supabase errors can contain table names, column names, constraint names, and RLS policy details. This is information disclosure that helps attackers map the database schema.

**Recommended fix:** Return generic errors to client, log real errors server-side:
```typescript
console.error("Shopping list error:", error.message);
return NextResponse.json({ error: "Operation failed" }, { status: 500 });
```

### M2: Discord Route Uses Service Client (RLS Bypass)
**Where:** `app/api/discord/route.ts`

**What:** Uses `createServiceClient()` which bypasses all RLS policies. This is architecturally necessary (Discord interactions don't have Supabase sessions), but means any authorization bug in the Discord handler gives unrestricted database access.

**Impact:** If the Discord signature verification is ever bypassed or if the handler has a logic bug, the attacker has full database access with no RLS guardrails.

**Recommended:** Extra code review scrutiny on Discord handler. Consider adding explicit household scoping checks even in service client queries.

### M3: Service Client Used in Cron/Pipeline Routes Without RLS
**Where:** `app/api/cron/daily-digest/route.ts`, `app/api/cron/streak-check/route.ts`, `app/api/pipeline/queue/route.ts`, `app/api/pipeline/status/route.ts`, `app/api/discord/admin/route.ts`

**What:** 6 routes use `createServiceClient()`. Each is protected by secret-based auth (CRON_SECRET, Discord signature, pipeline auth) rather than user auth. All are excluded from the middleware auth check.

**Impact:** If any secret is compromised, the attacker has full database access. This is standard architecture but worth noting.

### M4: Plaid Webhook `item_id` Not Validated
**Where:** `app/api/plaid/webhook/route.ts`

**What:** The `item_id` from the webhook body is passed directly to a `.eq()` query filter without format validation. While Supabase parameterizes it (no injection risk), defense-in-depth suggests validating the UUID format.

---

## LOW Findings

### L1: Habits Scoped to Owner, Not Household
**Where:** `app/api/habits/route.ts`

**What:** Habits are queried with `.eq("owner_id", user.id)` rather than household-scoped via `getHouseholdMemberIds()`. This means household members can't see each other's habits.

**Impact:** May be intentional (personal habits are private). If habits should be shared within the household, this is a gap.

---

## INFO / Notes

### I1: No Hardcoded Secrets Found
All grep patterns for API keys, tokens, and credentials came back clean. The matches were false positives (e.g., "task-enrichment" matching the `sk-` pattern in `task-`). All env files are properly gitignored.

### I2: Zero npm Vulnerabilities
`npm audit` returned 0 vulnerabilities across 443 dependencies (62 prod, 346 dev). Clean bill of health.

### I3: Environment Variables Properly Configured
**Vercel production (12 vars):** All required secrets present and encrypted:
- SUPABASE_SERVICE_ROLE_KEY ✅
- NEXT_PUBLIC_SUPABASE_URL ✅
- NEXT_PUBLIC_SUPABASE_ANON_KEY ✅
- DISCORD_BOT_TOKEN ✅
- DISCORD_PUBLIC_KEY ✅
- DISCORD_APP_ID ✅
- DISCORD_GUILD_ID ✅
- ANTHROPIC_API_KEY ✅
- PIPELINE_SECRET ✅
- PIPELINE_CHANNEL_ID ✅
- GITHUB_TOKEN ✅
- CRON_SECRET ✅

**GitHub secrets (starbase):** CLAUDE_CODE_OAUTH_TOKEN, PIPELINE_API_URL, PIPELINE_SECRET ✅

### I4: Activity Logging Exists
`lib/activity-log.ts` provides a `logActivity()` function that logs entity changes to `platform.activity_log`. Used across task, habit, goal, and comment routes. This is good audit trail coverage, though it's application-level (not database trigger-level like `supa_audit`).

---

## Recommended Actions (Priority Order)

1. **[CRITICAL → before public launch] Implement proper RLS policies** with `household_id` scoping. Currently all data isolation is in the API layer. The database should be the last line of defense.

2. **[HIGH → before public launch] Add rate limiting** — at minimum for `/api/agent` (cost exposure) and auth-adjacent routes.

3. **[HIGH → next session] Fix `pipeline/verify` household scope** — add the same `household_id` check that `pipeline/approve` has. 5-minute fix.

4. **[MEDIUM → next sprint] Sanitize error responses** — replace raw `error.message` returns with generic errors across all routes.

5. **[MEDIUM] Review Discord handler authorization logic** — service client bypass of RLS means any logic bug is unrestricted.

6. **[LOW] Decide on habits household visibility** — is owner-only scoping intentional?

---

## Next Audit
**Schedule:** Before any public launch or when adding new API routes with new database tables.
**Focus:** RLS policy implementation (if addressed), rate limiting verification, any new service client routes.
