-- supabase/migrations/20250417000000_add_sport_id_to_groups.sql
--
-- Two changes to support the Leagues feature:
--
-- 1. Add sport_id to the groups table so each league is scoped to one sport.
--    Nullable so existing rows (created before this feature) are not broken.
--
-- 2. Fix the groups UPDATE policy.
--    The old policy checked "created_by = auth.uid()" which means only the
--    original creator could edit the league name. But when the commissioner
--    role is transferred (via group_members), the new commissioner's user_id
--    doesn't match created_by — so they'd get a permission error trying to
--    edit the league name. The new policy checks group_members for the owner
--    role instead, which correctly follows role transfers.

-- -----------------------------------------------------------------------
-- 1. Add sport_id column
-- -----------------------------------------------------------------------
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS sport_id UUID REFERENCES sports(id);


-- -----------------------------------------------------------------------
-- 2. Fix the UPDATE policy on groups
--
-- Old policy: USING (created_by = auth.uid() OR is_admin())
-- New policy:  USING (is_admin() OR member with role='owner' in this group)
--
-- DROP the old policy first, then recreate with the corrected logic.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "groups: owner or admin can update" ON groups;

CREATE POLICY "groups: owner or admin can update"
  ON groups FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM group_members
       WHERE group_members.group_id = groups.id
         AND group_members.user_id  = auth.uid()
         AND group_members.role     = 'owner'
    )
  );
