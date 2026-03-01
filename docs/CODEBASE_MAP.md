# Desperado Club (Starbase) — Codebase Map

> **READ THIS FIRST** in every session working on this project. Compact index — read specific files on demand.

Last updated: 2026-02-28 (Session 10)

---

## What Is This?

Household command center + AI agent platform. Discord bot "Zev" + web UI. Tasks, habits, goals, shopping, budget, gamification (DCC theme), AI memory, onboarding, feedback. Built with Next.js 15 + Supabase + Claude API.

**Infra:** GitHub `plewis000/starbase` | Vercel `desparado-club` | Domain `starbase-green.vercel.app` | Supabase `starbase` (US East)

---

## Database: 4 Custom Schemas

| Schema | Purpose | Helper |
|--------|---------|--------|
| `platform` | Core tables (tasks, users, agent, gamification, feedback, households) | `platform(supabase)` |
| `config` | Lookups (statuses, priorities, types, efforts, tags, onboarding questions, seasons) | `config(supabase)` |
| `household` | Household-specific tables | `household(supabase)` |
| `finance` | Plaid/budget integration | `finance(supabase)` |

Schema helpers: `lib/supabase/schemas.ts`

**11 migrations** (001–011). Key ones:
- 005: agent_conversations, agent_messages, agent_actions, feedback
- 006: gamification (XP, achievements, loot boxes, leaderboard)
- 007: households, responsibilities, delegations, AI observations/decisions/suggestions, onboarding, user_model, boundaries, life_events, behavioral_aggregates
- 008-009: indexes, computed functions, schema alignment
- 010-011: RLS fixes, table permissions

---

## API Routes: 96 Total

| Domain | Routes | Key Files |
|--------|--------|-----------|
| Tasks | 14 | `app/api/tasks/` (CRUD, subtasks, checklist, comments, deps, tags) |
| Goals | 7 | `app/api/goals/` (CRUD, habits, milestones, tags, tasks) |
| Habits | 4 | `app/api/habits/` (CRUD, check-in, tags) |
| Shopping | 4 | `app/api/shopping/` (lists, items) |
| Household | 4 | `app/api/household/` (members, invite, redeem) |
| Notifications | 4 | `app/api/notifications/` (inbox, prefs, subscriptions) |
| Gamification | 6 | `app/api/gamification/` (profile, achievements, leaderboard, loot, party goals, rewards) |
| AI Agent | 3 | `app/api/agent/` (chat, usage) |
| AI Intelligence | 7 | `app/api/ai/` (observations, decisions, suggestions, user-model, aggregates, config-overrides) |
| Discord | 2 | `app/api/discord/` (webhook handler, setup) |
| Feedback | 3 | `app/api/feedback/` (CRUD, voting) |
| Finance | 10 | `app/api/finance/` + `app/api/plaid/` (budgets, transactions, sync) |
| Onboarding | 3 | `app/api/onboarding/` (state, advance, respond) |
| Config/Admin | 3 | `app/api/config/`, `app/api/admin/config/` |
| Other | 8 | commands, dashboard, engagement, features, life-events, user, boundaries, watchers |
| Comments (v2) | 3 | `app/api/comments/` (polymorphic) |
| Delegations | 5 | `app/api/delegations/`, `app/api/responsibilities/` |

**API patterns:** Auth check → schema-scoped query → cross-schema enrichment → activity log → non-blocking notifications. See `lib/task-enrichment.ts` for the Maps pattern.

---

## Agent Brain

| File | Purpose |
|------|---------|
| `lib/agent/client.ts` | Claude API client, model routing (Haiku/Sonnet), cost calc |
| `lib/agent/tools.ts` | 45+ tool definitions (tasks, habits, goals, shopping, budget, feedback, AI memory, onboarding) |
| `lib/agent/executor.ts` | Tool execution engine (large file) |
| `lib/agent/summarizer.ts` | Context compression for long conversations |

**Models:** Haiku (fast/cheap) and Sonnet (smart). Routed by `routeModel(message)`.

---

## Discord Integration

**File:** `app/api/discord/route.ts` (814 lines)

**Slash commands (direct DB, no AI cost):** `/task`, `/habit`, `/budget`, `/shop`, `/dashboard`, `/usage`, `/crawl`
**Agent command:** `/ask` → full Claude agent loop with tools

**User resolution:** Discord ID → `user_preferences` table → Supabase user_id
**Personalities:** `lib/personalities/zev.ts` (friendly guide), `lib/personalities/system-ai.ts` (sarcastic system)

---

## Key Libraries

| File | Purpose |
|------|---------|
| `lib/task-enrichment.ts` | Cross-schema FK resolution (Maps pattern) |
| `lib/activity-log.ts` | `logActivity()`, `logFieldChanges()` |
| `lib/notify.ts` / `lib/notify-v2.ts` | Notifications + Discord webhooks |
| `lib/recurrence-engine.ts` | Auto-create next task on completion |
| `lib/streak-engine.ts` | Streak calculation |
| `lib/gamification.ts` | `awardXp()`, `checkAchievements()`, `ensureProfile()` |
| `lib/goal-progress.ts` | Goal progress (4 types: manual, milestone, habit_driven, task_driven) |
| `lib/household.ts` | Household context + member queries |
| `lib/discord.ts` | Discord API helpers |
| `lib/validation.ts` | Centralized validation (UUID, date, string, enum, pagination) |
| `lib/supabase/middleware.ts` | Session refresh + auth enforcement |

---

## Auth Flow

Middleware → Supabase OAuth (Google) → cookie session → RLS. Discord webhook excluded from auth middleware. Vercel wildcard redirect: `https://*-plewis000s-projects.vercel.app/**`

---

## QA Suite

```bash
npm run qa          # All checks
npm run qa:select   # Cross-schema FK anti-patterns
npm run qa:forms    # Form value mismatches
npm run qa:config   # Hardcoded config values
npm run qa:contracts # API contract violations
npm run qa:preflight # Env + TypeScript + build
```

Migration linter: `qa/migration-linter.js` (enforces GRANT + RLS + SECURITY DEFINER rules)

---

## Env Vars Required

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY
DISCORD_BOT_TOKEN, DISCORD_APP_ID, DISCORD_PUBLIC_KEY, DISCORD_GUILD_ID
PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, PLAID_WEBHOOK_VERIFY_TOKEN
NEXT_PUBLIC_APP_URL
```

---

## Related Docs

- `docs/FAILURE_LOG.md` — Bug patterns + QA rules (F-001 through F-023)
- `docs/TASK_ENGINE_API_SPEC.md` — Full API specification
- `brief.md` — Project vision
- `architecture.md` — System design
- `ROADMAP.md` — Phase plan + blocked items
- `status.md` — Current build state
