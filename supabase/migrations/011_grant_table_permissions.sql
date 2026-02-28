-- ============================================================
-- Migration 011: Grant table permissions to authenticated/anon roles
--
-- PROBLEM: Migrations 005-009 created tables with RLS policies but
-- never granted table-level permissions to authenticated/anon roles.
-- Result: "permission denied for table X" on every query, even when
-- RLS policies would allow access.
--
-- RLS != table permissions. You need BOTH:
-- 1. GRANT on the table (can the role access the table at all?)
-- 2. RLS policy (which rows can the role see/modify?)
--
-- FIX: Grant ALL to authenticated, SELECT to anon, on all schemas.
-- Also set DEFAULT PRIVILEGES so future tables get grants automatically.
-- ============================================================

-- Platform schema
GRANT ALL ON ALL TABLES IN SCHEMA platform TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA platform TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA platform TO authenticated;

-- Config schema
GRANT ALL ON ALL TABLES IN SCHEMA config TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA config TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA config TO authenticated;

-- Household schema
GRANT ALL ON ALL TABLES IN SCHEMA household TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA household TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA household TO authenticated;

-- Finance schema
GRANT ALL ON ALL TABLES IN SCHEMA finance TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA finance TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA finance TO authenticated;

-- Schema usage
GRANT USAGE ON SCHEMA platform TO authenticated, anon;
GRANT USAGE ON SCHEMA config TO authenticated, anon;
GRANT USAGE ON SCHEMA household TO authenticated, anon;
GRANT USAGE ON SCHEMA finance TO authenticated, anon;

-- Default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA platform GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA config GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA config GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA household GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA household GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT SELECT ON TABLES TO anon;
