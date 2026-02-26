# Starbase — Architecture

Last updated: 2026-02-26 (Sisyphus import)

---

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel (Hosting)                       │
│                                                          │
│  ┌──────────────┐  ┌─────────────────────────────────┐  │
│  │  Next.js App  │  │         API Routes              │  │
│  │  (React 19)   │──│  /api/tasks, /api/notifications │  │
│  │  App Router   │  │  /api/config, /api/tags         │  │
│  └──────┬───────┘  └──────────────┬──────────────────┘  │
│         │                          │                     │
│         │    ┌─────────────────────┤                     │
│         │    │  lib/               │                     │
│         │    │  task-enrichment.ts  │                     │
│         │    │  activity-log.ts    │                     │
│         │    │  notify.ts          │                     │
│         │    │  recurrence-engine  │                     │
│         │    └─────────────────────┤                     │
└─────────┼──────────────────────────┼─────────────────────┘
          │                          │
          │                          ▼
          │              ┌─────────────────────┐
          │              │   Supabase           │
          │              │   ┌───────────────┐  │
          │              │   │ platform.*    │  │  ← tasks, users, activity_log
          │              │   │ config.*      │  │  ← statuses, priorities, types
          │              │   │ household.*   │  │  ← reserved
          │              │   │ finance.*     │  │  ← reserved
          │              │   └───────────────┘  │
          │              │   Auth (Google OAuth) │
          │              │   RLS Policies        │
          │              └─────────────────────┘
          │
          ▼
┌───────────────────┐
│  Discord Webhooks  │  ← Notifications
└───────────────────┘
```

## Data Flow

### Read Path (GET /api/tasks)
1. Middleware validates session cookie
2. API route receives request with filter/sort params
3. Schema-scoped query: `platform(supabase).from("tasks")`
4. Parallel config fetch: `getConfigLookups()` via `Promise.all()`
5. Enrichment: resolve FK UUIDs to full objects via `Map<id, record>`
6. Return enriched task array + total count

### Write Path (POST/PATCH /api/tasks)
1. Auth check → validate input
2. Insert/update in platform schema
3. Handle relations (domain memberships, tags, checklist items)
4. `logActivity()` or `logFieldChanges()` → activity_log
5. `triggerNotification().catch()` → non-blocking notification dispatch
6. If completing a recurring task: `createNextRecurrence()`

## Schema Architecture

Four custom PostgreSQL schemas (not public):
- **platform** — core data (tasks, users, notifications, activity_log)
- **config** — lookup tables (statuses, priorities, types, tags, domains)
- **household** — reserved for household-specific tables
- **finance** — reserved for YNAB/expense integration

Critical constraint: PostgREST cannot resolve FK joins across schemas. All cross-schema resolution happens in application code via `lib/task-enrichment.ts`.

## Auth Architecture

- Supabase OAuth with Google provider
- Middleware-enforced: single auth gate protects all routes
- Session stored in HTTP-only cookies via @supabase/ssr
- RLS policies on all tables (authenticated users can read/write platform tables)
- Wildcard redirect URL for Vercel preview deployments

## Component Architecture

- **No client state library** — React hooks only
- **Server components** for layouts, **client components** for interactive UI
- **Fetch to API routes** from client components (no direct Supabase calls from browser)
- **Dark-first Tailwind** design system, all components hand-built

## Key Patterns

| Pattern | Implementation | Why |
|---------|---------------|-----|
| Cross-schema enrichment | `lib/task-enrichment.ts` | PostgREST FK limitation |
| Activity logging on every mutation | `lib/activity-log.ts` | Full audit trail |
| Non-blocking notifications | `.catch(console.error)` | Prevent notification failures from breaking APIs |
| Config at runtime | `/api/config` endpoint | No hardcoded IDs |
| Sort whitelist | `VALID_SORT_COLUMNS` | Prevent injection + 500s |
| Schema helpers | `platform()`, `config()` | Type-safe schema access |
