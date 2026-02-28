# Desperado Club — Migration Deployment

## Current Migration State

Migrations 001-008. Run in order. Each is idempotent where possible (IF NOT EXISTS).

## Deploy All Migrations (Fresh DB)

```bash
# From the starbase project directory

# Run each migration in order via Supabase SQL Editor or CLI
# Option A: Supabase Dashboard → SQL Editor → paste each file
# Option B: psql direct connection

psql "$DATABASE_URL" -f supabase/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/002_task_engine_extended.sql
psql "$DATABASE_URL" -f supabase/migrations/003_goals_habits.sql
psql "$DATABASE_URL" -f supabase/migrations/004_comments_tags_notifications_upgrade.sql
psql "$DATABASE_URL" -f supabase/migrations/005_agentic_platform.sql
psql "$DATABASE_URL" -f supabase/migrations/006_gamification.sql
psql "$DATABASE_URL" -f supabase/migrations/007_agentic_infrastructure.sql
psql "$DATABASE_URL" -f supabase/migrations/008_agentic_enhancements.sql
```

## Seed Data (run after migrations)

```bash
# Config seeds — task statuses, priorities, categories, etc.
psql "$DATABASE_URL" -f supabase/seeds/config_seeds.sql
psql "$DATABASE_URL" -f supabase/seeds/config_seeds_002.sql
psql "$DATABASE_URL" -f supabase/seeds/config_seeds_003.sql

# Gamification seeds — floors, achievements, loot tables
psql "$DATABASE_URL" -f supabase/seeds/gamification_seeds.sql

# Agentic seeds — onboarding questions, responsibility categories
psql "$DATABASE_URL" -f supabase/seeds/agentic_seeds.sql
```

## Incremental Deployment (existing DB)

If migrations 001-006 are already deployed:

```bash
psql "$DATABASE_URL" -f supabase/migrations/007_agentic_infrastructure.sql
psql "$DATABASE_URL" -f supabase/migrations/008_agentic_enhancements.sql
psql "$DATABASE_URL" -f supabase/seeds/agentic_seeds.sql
```

## Required Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic (for AI agent)
ANTHROPIC_API_KEY=sk-ant-...

# Discord Bot
DISCORD_APP_ID=your-app-id
DISCORD_PUBLIC_KEY=your-public-key
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_GUILD_ID=your-guild-id

# Optional: Plaid (finance)
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET=your-secret
PLAID_ENV=sandbox|development|production
```

## Vercel Deployment

```bash
# Deploy to Vercel
vercel --prod

# Or link and deploy
vercel link
vercel env pull .env.local
vercel --prod
```

## Post-Deploy Verification

1. Visit `/login` — should redirect to Supabase Auth
2. After login, `/dashboard` should load with crawler profile
3. Test Zev chat: `/chat` or the floating bubble
4. Discord: verify `/ask` command routes through the agent
5. Check `/api/ai/suggestions?status=pending` returns 200
