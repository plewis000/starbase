-- 019: Household-scoped RLS for tasks and related tables
-- Replaces permissive USING(true) policies with household-scoped access.
-- Tasks are scoped through created_by → household_members → household.

-- =============================================================
-- 1. Helper function: get all user IDs in the current user's household
-- =============================================================
CREATE OR REPLACE FUNCTION platform.get_user_household_member_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT hm.user_id
  FROM platform.household_members hm
  WHERE hm.household_id = (
    SELECT hm2.household_id
    FROM platform.household_members hm2
    WHERE hm2.user_id = auth.uid()
    LIMIT 1
  )
$$;

-- =============================================================
-- 2. platform.tasks — drop old permissive policies, create scoped ones
-- =============================================================
DROP POLICY IF EXISTS "tasks_read_all" ON platform.tasks;
DROP POLICY IF EXISTS "tasks_write_authenticated" ON platform.tasks;

CREATE POLICY "tasks_select_household"
  ON platform.tasks FOR SELECT TO authenticated
  USING (created_by IN (SELECT platform.get_user_household_member_ids()));

CREATE POLICY "tasks_insert_own"
  ON platform.tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "tasks_update_household"
  ON platform.tasks FOR UPDATE TO authenticated
  USING (created_by IN (SELECT platform.get_user_household_member_ids()));

CREATE POLICY "tasks_delete_own"
  ON platform.tasks FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- =============================================================
-- 3. platform.task_completions — scope SELECT by task household
-- =============================================================
DROP POLICY IF EXISTS "tc_select" ON platform.task_completions;
DROP POLICY IF EXISTS "tc_insert" ON platform.task_completions;
DROP POLICY IF EXISTS "tc_delete" ON platform.task_completions;

CREATE POLICY "tc_select_household"
  ON platform.task_completions FOR SELECT TO authenticated
  USING (
    task_id IN (
      SELECT t.id FROM platform.tasks t
      WHERE t.created_by IN (SELECT platform.get_user_household_member_ids())
    )
  );

CREATE POLICY "tc_insert_own"
  ON platform.task_completions FOR INSERT TO authenticated
  WITH CHECK (completed_by = auth.uid());

CREATE POLICY "tc_delete_own"
  ON platform.task_completions FOR DELETE TO authenticated
  USING (completed_by = auth.uid());

-- =============================================================
-- 4. platform.task_tags — scope by task household ownership
-- =============================================================
DROP POLICY IF EXISTS "shared_read" ON platform.task_tags;
DROP POLICY IF EXISTS "shared_write" ON platform.task_tags;

CREATE POLICY "task_tags_select_household"
  ON platform.task_tags FOR SELECT TO authenticated
  USING (
    task_id IN (
      SELECT t.id FROM platform.tasks t
      WHERE t.created_by IN (SELECT platform.get_user_household_member_ids())
    )
  );

CREATE POLICY "task_tags_insert_household"
  ON platform.task_tags FOR INSERT TO authenticated
  WITH CHECK (
    task_id IN (
      SELECT t.id FROM platform.tasks t
      WHERE t.created_by IN (SELECT platform.get_user_household_member_ids())
    )
  );

CREATE POLICY "task_tags_update_household"
  ON platform.task_tags FOR UPDATE TO authenticated
  USING (
    task_id IN (
      SELECT t.id FROM platform.tasks t
      WHERE t.created_by IN (SELECT platform.get_user_household_member_ids())
    )
  );

CREATE POLICY "task_tags_delete_household"
  ON platform.task_tags FOR DELETE TO authenticated
  USING (
    task_id IN (
      SELECT t.id FROM platform.tasks t
      WHERE t.created_by IN (SELECT platform.get_user_household_member_ids())
    )
  );

-- =============================================================
-- 5. platform.entity_links — scope SELECT by household
-- =============================================================
DROP POLICY IF EXISTS "entity_links_select" ON platform.entity_links;
DROP POLICY IF EXISTS "entity_links_insert" ON platform.entity_links;
DROP POLICY IF EXISTS "entity_links_delete" ON platform.entity_links;

CREATE POLICY "entity_links_select_household"
  ON platform.entity_links FOR SELECT TO authenticated
  USING (created_by IN (SELECT platform.get_user_household_member_ids()));

CREATE POLICY "entity_links_insert_own"
  ON platform.entity_links FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "entity_links_delete_own"
  ON platform.entity_links FOR DELETE TO authenticated
  USING (created_by = auth.uid());
