# Starbase — Roadmap

Last Updated: 2026-02-26

---

## Active Focus: Phase 1-3 Only

Phases 4-9 are designed into the schema but NOT built until Phase 1-3 are in daily use for at least two weeks. Usage drives priority.

---

## Phase 1: Data Foundation ← ACTIVE NOW

**Goal:** All new tables exist, finance APIs work, Plaid connected with real bank data, feedback system operational.

| Component | Description | Status |
|-----------|-------------|--------|
| Migration 005 | All new tables: finance expansion, feedback, agent infra, contacts, home, recipes/meals | Building |
| Finance API routes | Transactions CRUD, budgets, splits, summary, merchant rules | Pending |
| Plaid integration | Link token, webhook, transaction sync, account linking | Pending |
| Plaid live | Apply for Development access, link real bank accounts | Pending |
| Feedback API routes | CRUD for improvement requests | Pending |
| Transaction triage UI | Budget page with classification queue, split modal, spending view | Pending |
| Config seed data | Expense categories with Plaid mappings | Pending |
| Apply migration to Supabase | Run 005 against production DB | Pending |

## Phase 2: Agent Brain

**Goal:** Claude-powered agent function that can interpret natural language and execute operations against all Starbase data.

| Component | Description | Status |
|-----------|-------------|--------|
| Agent API function | Vercel serverless function, Claude API, tool definitions | Blocked (needs API key) |
| Tool definitions | 25-30 tools covering all domains | Blocked |
| Conversation logging | Store conversations + tool calls in agent_messages | Blocked |
| Model routing | Haiku for simple, Sonnet for complex | Blocked |
| Cost tracking | Token usage per conversation, daily/monthly totals | Blocked |

## Phase 3: Discord Bot

**Goal:** Working Discord bot that forwards messages to the agent brain and posts responses.

| Component | Description | Status |
|-----------|-------------|--------|
| Discord bot | Node.js bot, message handling, channel routing | Blocked (needs bot token) |
| User mapping | Discord user ID → Supabase user ID | Blocked |
| Channel routing | Route responses to correct channels | Blocked |
| Slash commands | /task, /habit, /budget, /feedback shortcuts | Blocked |

---

## Deferred Phases (designed, not built)

### Phase 4: Automation
Cron jobs: daily brief, evening check-in, transaction sync, budget alerts, contact reminders.

### Phase 5: Google Integration
OAuth flow for Calendar (R/W), Gmail (read + draft), Contacts (sync from labeled group).

### Phase 6: RETIRED — Plaid Live moved to Phase 1

### Phase 7: Meal Planning
Recipe import (URL → structured data via Claude), meal plans, grocery list auto-generation.

### Phase 8: Agentic Web UI
Chat interface on web, visual dashboards served by agent, conversational navigation.

### Phase 9: Home Automation
Home Assistant REST API integration, device sync, scenes ("Good Night", "Away Mode"), home-aware daily brief. Hardware: HA Yellow + Zooz ZST39 + SkyConnect + Nabu Casa.

---

## Locked Decisions

| # | Decision | Session |
|---|----------|---------|
| 1 | Personal instance — work instance will be a separate copy | S1 |
| 2 | User approved auto mode-switching for this project | S5 |
| 3 | Confidence scoring: hybrid 80/60 | S1 |
| 4 | Two-tier pattern library | S1 |
| 5 | Goals & Habits merged: one project, two views | S1 |
| 6 | Goals personal (owner_id RLS), tasks shared household | S3 |
| 7 | Streak data denormalized, recalculated on every write | S3 |
| 8 | Goal progress: 4 types (manual, milestone, habit_driven, task_driven) | S3 |
| 9 | Centralized validation library at lib/validation.ts | S3 |
| 10 | Plaid replaces YNAB — single source of truth for budget | S5 |
| 11 | Merchant rules for auto-classification — no separate ML service | S5 |
| 12 | Google Contacts sync via labeled group ("Starbase") | S5 |
| 13 | Custom contact events supported (not just birthday/anniversary) | S5 |
| 14 | Chat default, visual UI for bulk review (transactions, budget, grocery) | S5 |
| 15 | Recipe → Meal Plan → Grocery List pipeline (schema now, UI Phase 7) | S5 |
| 16 | Per-user OAuth tokens — Gmail/Calendar/Contacts user-scoped, encrypted in Vault | S5 |
| 17 | Agent personality: light — competent, brief, occasional warmth | S5 |
| 18 | Discord is primary channel — no SMS | S5 |
| 19 | Single Claude API, model routing — Haiku simple, Sonnet complex | S5 |
| 20 | Home Assistant is the home automation platform | S5 |
| 21 | Z-Wave primary, Zigbee for sensors, WiFi cameras/thermostat | S5 |
| 22 | HA Yellow + Zooz ZST39 + SkyConnect + Nabu Casa recommended hardware | S5 |
| 23 | Google Home handles voice device control only, Starbase agent handles everything else | S5 |
| 24 | HA automations stay local for time-critical ops, agent handles context-rich ops | S5 |
| 25 | Dangerous home actions always require confirmation | S5 |
| 26 | Shared finances with support for individual accounts | S5 |
| 27 | Supabase Vault for all sensitive tokens | S5 |
| 28 | Phase 1-3 must be in daily use before building Phase 4+ | S5 |
| 29 | Budget granularity: per-category with transaction splitting support | S5 |
| 30 | Google Calendar: read + write access | S5 |

---

## External Account Setup Required

See `docs/ACCOUNT_SETUP_GUIDE.md` for step-by-step instructions.

| Account | Purpose | Status |
|---------|---------|--------|
| Claude API (console.anthropic.com) | Agent brain | Not created |
| Google Cloud project | OAuth for Gmail/Calendar/Contacts | Not created |
| Discord server + bot | Primary interface | Not created |
| Plaid (dashboard.plaid.com) | Finance/transaction sync | Not created |

---

## Estimated Ongoing Costs

| Service | Monthly |
|---------|---------|
| Claude API | $15-30 |
| Supabase (free tier) | $0 |
| Vercel (hobby tier) | $0 |
| Discord | $0 |
| Plaid (development tier) | $0 |
| Nabu Casa (future) | $6.50 |
| **Total** | **~$20-40** |
