# Starbase Codebase Map

> **READ THIS FIRST** in every new session. This is the single source of truth for understanding the Starbase project structure, patterns, and conventions.

Last updated: 2026-02-25 (Session 5)

---

## What Is Starbase?

Personal command center for Parker Lewis — task management, household coordination, notifications. Built with Next.js 15 + React 19 + Supabase + TypeScript + Tailwind CSS. Deployed on Vercel.

---

## Tech Stack

| Layer | Tech | Version |
|-------|------|---------|
| Framework | Next.js (App Router) | 15.2.6 |
| UI | React | 19.0.1 |
| Styling | Tailwind CSS (dark-first) | 3.4.1 |
| Database | Supabase (PostgreSQL) | SSR 0.5.2 |
| Auth | Supabase OAuth (Google) | via middleware |
| Deploy | Vercel (preview deployments) | - |
| Language | TypeScript (strict) | 5.x |

---

## Database: Custom Schemas

Supabase uses **4 custom schemas** (not `public`). All must be exposed in Supabase Dashboard > Settings > API > Exposed schemas.

| Schema | Purpose | Helper |
|--------|---------|--------|
| `platform` | Core tables (tasks, users, activity_log, notifications) | `platform(supabase)` |
| `config` | Lookup tables (statuses, priorities, types, efforts, tags) | `config(supabase)` |
| `household` | Reserved — household-specific tables | `household(supabase)` |
| `finance` | Reserved — YNAB integration | `finance(supabase)` |

Schema helpers live in `lib/supabase/schemas.ts`.

### Critical Pattern: Cross-Schema Enrichment

PostgREST **cannot** resolve FK joins across schemas. Never use FK hint syntax (e.g., `status:task_statuses!fk(*)`) for cross-schema references. Instead:

```
getConfigLookups(supabase)  →  fetches all config + user tables into Maps
enrichTasks(tasks, lookups) →  resolves FK IDs to full objects (O(1) per field)
```

See `lib/task-enrichment.ts`. Every GET endpoint follows this pattern.

---

## Directory Structure

```
starbase/
├── app/
│   ├── api/                    # 16 API route files
│   │   ├── config/route.ts     # GET config lookups (statuses, priorities, etc.)
│   │   ├── tasks/route.ts      # GET (list+filter) / POST (create)
│   │   ├── tasks/[id]/route.ts # GET / PATCH / DELETE single task
│   │   ├── tasks/[id]/subtasks/
│   │   ├── tasks/[id]/comments/
│   │   ├── tasks/[id]/checklist/
│   │   ├── tasks/[id]/dependencies/
│   │   ├── tasks/[id]/tags/
│   │   ├── tags/route.ts
│   │   └── notifications/      # inbox, preferences, single notification
│   ├── tasks/                  # Task list + detail UI pages
│   ├── notifications/          # Notification inbox UI
│   ├── dashboard/              # Dashboard page
│   ├── login/                  # Login page
│   ├── auth/callback/          # OAuth callback
│   ├── layout.tsx              # Root layout (dark theme, PWA meta)
│   └── page.tsx                # Home redirect
│
├── components/
│   ├── ui/                     # Primitives (AppShell, Modal, StatusBadge, etc.)
│   ├── tasks/                  # TaskList, TaskDetail, TaskForm, FilterBar, etc.
│   └── notifications/          # NotificationInbox
│
├── lib/
│   ├── supabase/
│   │   ├── schemas.ts          # platform(), config(), household(), finance()
│   │   ├── server.ts           # SSR Supabase client (cookie-based)
│   │   ├── client.ts           # Browser Supabase client
│   │   └── middleware.ts        # Session refresh helper
│   ├── task-enrichment.ts      # Cross-schema FK resolution (Maps pattern)
│   ├── activity-log.ts         # logActivity(), logFieldChanges()
│   ├── notify.ts               # triggerNotification(), Discord webhooks
│   ├── recurrence-engine.ts    # createNextRecurrence() on task completion
│   ├── recurrence.ts           # RRULE parser, getNextOccurrence()
│   └── types.ts                # Shared TypeScript interfaces
│
├── qa/                         # QA linting scripts (run via npm run qa)
│   ├── run-all.js              # Master runner
│   ├── select-string-linter.js # Cross-schema FK hints, double wildcards
│   ├── form-value-checker.js   # Display labels used as API values
│   ├── config-hardcode-detector.js  # Hardcoded config IDs
│   ├── api-contract-checker.js # Frontend-API param mismatches
│   └── deploy-preflight.js     # Env vars, TypeScript, build checks
│
├── docs/
│   ├── CODEBASE_MAP.md         # THIS FILE — read first every session
│   ├── FAILURE_LOG.md          # All bugs with root cause + patterns
│   └── TASK_ENGINE_API_SPEC.md # Full API specification
│
├── middleware.ts               # Root auth middleware (protects all routes)
├── next.config.ts              # PWA headers
├── tailwind.config.ts          # Default + dark theme
└── package.json                # Scripts: dev, build, lint, qa, qa:*
```

---

## API Patterns

Every API route follows the same structure:

1. **Auth check** — `supabase.auth.getUser()` → 401 if missing
2. **Schema-scoped queries** — `platform(supabase).from("tasks")` (never raw `.from()`)
3. **Cross-schema enrichment** — `getConfigLookups()` + `enrichTasks()`
4. **Activity logging** — `logActivity()` or `logFieldChanges()` on mutations
5. **Non-blocking notifications** — `triggerNotification().catch(console.error)`

### Sort Column Whitelist

The tasks GET route validates sort params against a whitelist:
```
VALID_SORT_COLUMNS = ["due_date", "priority_id", "created_at", "updated_at", "title", "completed_at", "start_date", "sort_order"]
```

### Status/Priority Filters

FilterBar sends **display names** ("To Do", "In Progress") as query params. The API does a `config.task_statuses.select("id").in("name", slugs)` lookup. This is intentional — the API translates names to UUIDs server-side.

### TaskForm Config Fetch

TaskForm fetches real UUIDs from `GET /api/config` on mount. Never hardcode status/priority IDs in components.

---

## Key Design Decisions

| # | Decision | Why |
|---|----------|-----|
| 1 | Cross-schema Maps enrichment | PostgREST can't join across schemas |
| 2 | Field-level activity logging | Full audit trail for every change |
| 3 | Soft deletes (archive) | Preserve data; tasks set to Archived status |
| 4 | Non-blocking notifications | `.catch()` wrapper prevents API failures |
| 5 | RRULE parser (custom) | Lightweight; covers 95% of household use cases |
| 6 | Recurrence on completion | New task auto-created when Done |
| 7 | Middleware auth enforcement | Single auth gate; no per-route checks needed |
| 8 | Config fetched at runtime | TaskForm hits /api/config; no hardcoded IDs |

---

## QA Suite

Run before every deployment:

```bash
npm run qa          # All 5 checks
npm run qa:select   # .select() anti-patterns
npm run qa:forms    # Form value mismatches
npm run qa:config   # Hardcoded config values
npm run qa:contracts # API contract violations
npm run qa:preflight # Env + TypeScript + build
```

All scripts exit non-zero on errors. See `docs/FAILURE_LOG.md` for the patterns these catch.

---

## Auth Flow

1. Middleware (`middleware.ts`) intercepts all requests
2. Unauthenticated → redirect to `/login`
3. Login page → "Continue with Google" → Supabase OAuth
4. Callback at `/auth/callback` → exchanges code for session
5. Session stored in cookies → `createClient()` reads on every request

**Vercel wildcard redirect:** `https://*-plewis000s-projects.vercel.app/**` is in Supabase allowlist so preview deployments work.

---

## UI Design System

Dark-first Tailwind: `slate-950` bg, `slate-900` cards, `slate-800` borders, `green-400` accents. No component libraries — all hand-built in `components/ui/`.

Components: AppShell (sidebar + header), Modal (3 sizes), StatusBadge, PriorityBadge, EmptyState, LoadingSpinner, BottomNav (mobile).

---

## Context Files

Located at `/context/` (sibling to `starbase/`):

| File | Purpose |
|------|---------|
| `active_projects.md` | 16-project roadmap with phases |
| `life_snapshot.md` | Parker's household, work, finances |
| `my_preferences.md` | Communication style, work preferences |
| `weekly_focus.md` | Current week priorities |

---

## Related Docs

- **Full API spec:** `docs/TASK_ENGINE_API_SPEC.md`
- **Bug patterns:** `docs/FAILURE_LOG.md`
- **User preferences:** `../context/my_preferences.md`

---

## Quick Start for New Sessions

1. Read this file (`docs/CODEBASE_MAP.md`)
2. Check `docs/FAILURE_LOG.md` for recent issues
3. Check `context/my_preferences.md` for Parker's work style
4. Run `npm run qa` before any deployment
5. Use `lib/task-enrichment.ts` for any new queries involving config/user data
6. Log any new bugs to `docs/FAILURE_LOG.md` using the existing template
