# Zev — Capabilities Map

Last updated: 2026-03-01 | Session: 11

## What Zev Is

Zev is the household AI assistant for the Desperado Club (Starbase). She manages tasks, habits, goals, budgets, shopping, and feedback — all through Discord and the web app. She has a personality (warm, direct, slightly sarcastic dungeon crawler guide) and uses gamification (XP, achievements, levels).

## Current Capabilities

### Discord Slash Commands
| Command | What it does | Status |
|---------|-------------|--------|
| `/ask <message>` | Talk to Zev (full agent with tools) | Working |
| `/task <title>` | Create a task | Working |
| `/habit <name>` | Check in on a habit | Working |
| `/budget` | Spending overview | Working |
| `/shop <items>` | Add to shopping list | Working |
| `/dashboard` | Daily briefing | Working |
| `/usage` | API cost tracking | Working |
| `/feedback <text>` | Submit feedback to pipeline | Working |
| `/pipeline` | View active pipeline jobs | Working |

### Agent Tools (available via /ask and conversational mode)
| Tool | What it does | Status |
|------|-------------|--------|
| `get_tasks` | List tasks with filters | Working |
| `create_task` | Create a new task | Working |
| `update_task` | Update task status/details | Working |
| `get_habits` | List habits | Working |
| `check_in_habit` | Log habit completion | Working |
| `get_goals` | List goals | Working |
| `get_budget_summary` | Monthly spending overview | Working |
| `get_transactions` | Recent transactions | Working |
| `get_shopping_lists` | View shopping lists | Working |
| `add_shopping_items` | Add items to a list | Working |
| `submit_feedback` | Log feedback → posts to #pipeline | Working |
| `get_onboarding_state` | Check onboarding progress | Working |
| `start_onboarding` | Begin new user onboarding | Working |
| `submit_onboarding_response` | Answer onboarding questions | Working |

### Conversational Feedback Capture
Zev proactively captures feedback from natural conversation:
- "this button doesn't work" → auto-logs as bug
- "I wish we had dark mode" → auto-logs as wish
- "the budget page is confusing" → auto-logs as feedback

### Pipeline Integration
- Feedback from any source (web, Discord, conversation) posts to #pipeline
- Approve/Won't Fix buttons with modal for notes
- Worker picks up approved items, runs Claude Code, creates PR
- Preview Ready embed with Test Preview / Ship It / Reject buttons

### Onboarding Flow
- New users get welcomed and registered
- Quick start (gradual questions) or full interview (10 questions upfront)
- Deferred questions asked one per conversation for quick-start users

### Gamification
- XP system with achievements
- Crawler/dungeon theme ("floors", "XP", "The System")
- Profile with level tracking

## Current Limitations

### Discord
- **No conversational mode** — requires `/ask` for every message (no Gateway connection)
- **No @mention response** — can't respond to "hey zev" in regular chat
- **Single channel** — no dedicated Zev channel for natural conversation
- **No message history** — each `/ask` is a fresh conversation, no context from previous messages

### Pipeline
- **No live status updates** — only "Working on..." and result, no mid-job progress
- **No Revise button** — can only Ship or Reject, no "needs changes" loop
- **No auto-retry** — failed jobs stay failed, need manual re-queue
- **Vague feedback = poor results** — Claude needs specific, actionable descriptions
- **Worker must be running locally** — no always-on deployment

### Agent
- **No multi-turn memory** — each conversation starts fresh
- **No cross-conversation context** — Zev doesn't remember what you said yesterday
- **No proactive notifications** — can't DM you about overdue tasks or habits

## Planned Improvements

### High Priority
1. **Gateway bot for conversational mode** — discord.js in pipeline worker, respond to "zev" mentions in any channel. Zero extra cost (Max plan + free Gateway).
2. **Live pipeline status updates** — "Reading files..." → "Making changes..." → "Building..." in Discord
3. **Revise button on Preview Ready** — modal for change requests, re-queues on same branch
4. **Auto-retry failed jobs** — with cooldown and max attempts

### Medium Priority
5. **Discord message history** — store last N messages per user for conversation continuity
6. **Proactive notifications** — Zev DMs for overdue tasks, habit streaks, budget alerts
7. **Multi-user context** — Zev remembers both Parker and Lenale's preferences separately

### Lower Priority
8. **Voice channel support** — Zev responds to voice commands
9. **Scheduled messages** — "Remind me at 9am to..."
10. **Cross-platform** — same Zev accessible via web chat, not just Discord

## Architecture

```
Discord
  ├── Slash Commands → Vercel /api/discord (interactions webhook)
  │     └── processCommand() → Zev Agent (Claude API)
  ├── Button Clicks → Vercel /api/discord (type 3 interaction)
  │     └── handleButtonInteraction() / handleModalSubmit()
  └── Channel Messages → Pipeline Worker (Gateway) [PLANNED]
        └── Forward to Zev Agent

Zev Agent
  ├── System Prompt: lib/personalities/zev.ts
  ├── Tools: lib/agent/tools.ts
  ├── Executor: lib/agent/executor.ts
  └── Client: lib/agent/client.ts (Claude API via Anthropic SDK)

Pipeline
  ├── Queue API: /api/pipeline/queue
  ├── Status API: /api/pipeline/status
  ├── Admin API: /api/discord/admin
  └── Worker: tools/pipeline-worker.ts (local Node script)
```

## Key Files

| File | Purpose |
|------|---------|
| `app/api/discord/route.ts` | Discord interactions webhook — slash commands, buttons, modals |
| `lib/personalities/zev.ts` | Zev's system prompt and personality |
| `lib/agent/tools.ts` | Tool definitions for the agent |
| `lib/agent/executor.ts` | Tool execution logic |
| `lib/agent/client.ts` | Claude API client config |
| `lib/discord.ts` | Discord API helpers |
| `app/api/pipeline/queue/route.ts` | Worker polls for jobs |
| `app/api/pipeline/status/route.ts` | Worker reports progress |
| `app/api/discord/admin/route.ts` | Admin actions (cleanup, post, etc.) |
| `tools/pipeline-worker.ts` | Local pipeline worker |
| `app/api/feedback/route.ts` | Web form feedback submission |
