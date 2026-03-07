# Starbase

## Git
- **This directory IS the git repo.** Remote: `github.com/plewis000/starbase`, branch: `main`
- All git commands run from here (not from parent Sisyphus directory)

## Build & Deploy
- **Build gate**: `npm run build` before committing (lint has config issue — ignore it)
- Push to `main` → auto-deploys via Vercel (`starbase-green.vercel.app`)
- QA: `node qa/run-all.js`

## Stack
- Next.js 16 + React 19 (App Router) + Supabase + Vercel
- Schemas: `platform`, `config`, `household`, `finance`, `ea`
- Auth: Cookie-based Supabase (web), Discord bearer (Activity), PIPELINE_SECRET (worker)

## Deep Context
- **System map** (architecture, flows, cross-cutting): `~/.claude/projects/C--Users-Parker-Desktop-Sisyphus/memory/system-map.md`
- **Components, hooks, design system**: `~/.claude/projects/C--Users-Parker-Desktop-Sisyphus/memory/starbase.md`
- **API routes inventory**: `~/.claude/projects/C--Users-Parker-Desktop-Sisyphus/memory/api-routes.md`
- **DB schema**: `~/.claude/projects/C--Users-Parker-Desktop-Sisyphus/memory/database-schema.md`

When shipping changes that add routes, tables, crons, or agent tools — update system-map.md.
