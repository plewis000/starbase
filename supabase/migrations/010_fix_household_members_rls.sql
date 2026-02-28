-- ============================================================
-- Migration 010: Fix household_members RLS infinite recursion
--
-- PROBLEM: household_members SELECT policy referenced itself:
--   USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()))
-- This caused infinite recursion when any other table's RLS
-- policy queried household_members (feedback, responsibilities, etc.)
--
-- FIX: Use SECURITY DEFINER functions to bypass RLS for self-referencing queries
-- ============================================================

-- Security definer function: get current user's household IDs (bypasses RLS)
CREATE OR REPLACE FUNCTION platform.get_user_household_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT household_id FROM platform.household_members
  WHERE user_id = auth.uid();
$$;

-- Security definer function: check if current user is admin of a household
CREATE OR REPLACE FUNCTION platform.is_household_admin(p_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform.household_members
    WHERE household_id = p_household_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;

-- Drop old recursive policies
DROP POLICY IF EXISTS "household_members_read" ON platform.household_members;
DROP POLICY IF EXISTS "household_members_write" ON platform.household_members;
DROP POLICY IF EXISTS "household_members_manage" ON platform.household_members;

-- New non-recursive policies
CREATE POLICY "household_members_read" ON platform.household_members
  FOR SELECT USING (
    household_id IN (SELECT platform.get_user_household_ids())
  );

CREATE POLICY "household_members_insert" ON platform.household_members
  FOR INSERT WITH CHECK (
    platform.is_household_admin(household_id)
  );

CREATE POLICY "household_members_update" ON platform.household_members
  FOR UPDATE USING (
    platform.is_household_admin(household_id)
  );

CREATE POLICY "household_members_delete" ON platform.household_members
  FOR DELETE USING (
    user_id = auth.uid() OR platform.is_household_admin(household_id)
  );
