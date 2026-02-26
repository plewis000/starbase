# Starbase — Project Brief

**Owner:** Parker Lewis
**Status:** In-flight (Phase 1B complete, Phase 2 pending)
**Priority:** Primary active project
**Imported:** 2026-02-26 (Session 3)

---

## What It Is

Starbase is a personal command center for task management, household coordination, and notifications. It's the execution layer for Sisyphus — where plans become trackable, delegatable, recurring work items that both Parker and Lenale can interact with.

## Why It Exists

Parker's mental load problem: too many things to track across too many contexts (household chores, errands, personal goals, health, finance). Existing tools either require too much maintenance or don't support the household-as-a-team model. Starbase is designed to reduce cognitive overhead, not add to it.

## Who Uses It

- **Parker Lewis** — primary user, creates most tasks, manages system
- **Lenale Lewis** — household co-user, needs mobile-first low-friction experience
- **Sisyphus (Claude)** — will create/manage tasks via API (source: "claude")

## Key Design Principles

1. **Mobile-first, low friction** — Lenale won't adopt anything complex
2. **Database-driven config** — no code changes for new options
3. **Resilient to gaps** — systems that require daily attention die
4. **Google is home base** — Google-native when there's a choice
5. **Discord is the notification layer** — Lenale lives in Discord

## Tech Stack

Next.js 15 + React 19 + TypeScript + Supabase (PostgreSQL) + Tailwind CSS. Deployed on Vercel.

## Current State

Phase 1B complete: full task CRUD, filtering/sorting, notifications (in-app + Discord), recurrence engine, checklist/comments/dependencies/tags, QA suite. UI components built but untested in real use.

## What's Next

- Task UI polish + real-world testing
- Habits + Goals system (merged project: Outcome View + Behavior View)
- Shopping list module
- Discord webhook integration for task notifications
- Home Assistant integration (future)
