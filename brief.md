# Starbase — Project Brief

**Owner:** Parker Lewis
**Status:** In-flight — Agentic Platform Build (Phase 1 active)
**Priority:** Primary active project
**Started:** 2026-02-25
**Last Updated:** 2026-02-26

---

## What It Is

Starbase is a personal operating system with a conversational interface. The database is the brain's memory. A Claude-powered agent is the brain. Discord and the web are ways to talk to it. Every feature — tasks, goals, habits, shopping, budget, calendar, email, home — is data the agent can access and act on.

The web UI is a dashboard and visual review tool. Discord is the primary conversational interface. The agent orchestrates everything.

## Why It Exists

Parker's mental load problem: too many things to track across too many contexts (household, errands, goals, health, finance, home). Existing tools either require too much maintenance, don't talk to each other, or don't support the household-as-a-team model. Starbase consolidates everything behind a single conversational agent that proactively manages, reminds, and reports.

## Who Uses It

- **Parker Lewis** — primary user, system admin, manages integrations
- **Lenale Lewis** — household co-user, equal access to shared features, Discord-native
- **Starbase Agent (Claude)** — the brain, handles all operations via natural language

## Key Design Principles

1. **Agent-first** — chat is the default interface, visual UI only where bulk review is genuinely faster
2. **Database-driven config** — no code changes for new options
3. **Resilient to gaps** — systems that require daily attention die. The agent fills gaps proactively.
4. **Google is home base** — Calendar, Gmail, Contacts as primary PIM
5. **Discord is the household interface** — both users live there
6. **Per-user context** — one agent brain, parameterized by who's talking
7. **Learn from corrections** — merchant rules, habit patterns, preferences all improve with use
8. **Ship and use before expanding** — Phase 1-3 must be in daily use before building Phase 4+

## Tech Stack

- **App:** Next.js 16 + React 19 + TypeScript + Tailwind CSS
- **Database:** Supabase (PostgreSQL, multi-schema: platform, config, household, finance, health)
- **Hosting:** Vercel (serverless functions + static hosting)
- **Agent Brain:** Claude API (Sonnet for complex, Haiku for simple)
- **Primary Interface:** Discord bot
- **Finance:** Plaid (transaction sync, replaces YNAB)
- **Google:** Calendar (R/W), Gmail (read + draft), Contacts (read + sync)
- **Home Automation:** Home Assistant (REST API), Z-Wave + Zigbee, Google Home for voice device control
- **Source Control:** GitHub (plewis000/starbase)

## Domains

| Domain | Schema | Status |
|--------|--------|--------|
| Tasks | platform | Built — CRUD, subtasks, checklists, dependencies, comments, tags, recurrence |
| Goals | platform | Built — milestones, progress tracking (4 types), tag linking |
| Habits | platform | Built — streaks, check-ins, goal linking, frequency config |
| Shopping | household | Built — lists, items, categories, check/uncheck |
| Comments | platform | Built — polymorphic v2, threading, reactions, mentions |
| Notifications | platform | Built — in-app, preferences, subscriptions |
| Finance / Budget | finance | Phase 1 — Plaid integration, budgets, splits, merchant rules |
| Contacts | platform | Phase 1 — Google Contacts sync, birthday/event reminders |
| Agent Infrastructure | platform | Phase 1 — conversations, messages, actions, scheduled jobs |
| Feedback | platform | Phase 1 — improvement requests from either user |
| Home Automation | platform | Phase 9 — HA integration, device sync, scenes |
| Meal Planning | household | Phase 7 — recipes, meal plans, grocery list generation |
| Admin Config | config | Built — 10 config tables, admin-only API |
