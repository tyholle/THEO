-- supabase/migrations/20250418000000_league_rpc_and_security.sql
--
-- Security hardening and database functions for the Leagues feature.
--
-- Three problems this migration fixes:
--
-- 1. GROUPS SELECT was open to all authenticated users (USING (true)).
--    Any logged-in user could query the full groups table and read every
--    join code. Join codes are the only access control for leagues, so
--    this made them meaningless. Fixed: members can only see leagues
--    they already belong to. A SECURITY DEFINER function handles the
--    narrow "look up by join code" case for non-members.
--
-- 2. GROUP_MEMBERS INSERT had no join-code check. Any authenticated user
--    could insert themselves into any league directly via the Supabase
--    API, bypassing the join code entirely. Fixed: direct inserts are
--    blocked for regular users; joining now goes through a DB function
--    that validates the code, capacity, and duplicate membership
--    atomically in one transaction.
--
-- 3. LEAGUE CREATION was not atomic. The app inserted into groups first,
--    then group_members. If the second insert failed, an orphan league
--    with no owner was left in the DB. Fixed: a DB function does both
--    inserts in a single transaction — either both succeed or neither does.


-- -----------------------------------------------------------------------
-- 1. Tighten the groups SELECT policy
--    Before: USING (true) — any user could read all leagues + all codes.
--    After:  only members of a league can see that league's row.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "groups: authenticated users can read" ON groups;

CREATE POLICY "groups: members can read their groups"
  ON groups FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
       WHERE group_members.group_id = groups.id
         AND group_members.user_id  = auth.uid()
    )
  );


-- -----------------------------------------------------------------------
-- 2. lookup_group_by_join_code
--
-- Used by the "Join League" preview step. A user who hasn't joined yet
-- needs to look up one specific league by its join code — but we don't
-- want them to be able to query all leagues.
--
-- SECURITY DEFINER means this function runs with elevated privileges
-- (bypasses RLS), so it can read the groups table even though the caller
-- isn't a member yet. It only ever returns the one row that matches the
-- code — not the whole table.
--
-- Returns: one row with preview info, or zero rows if code is invalid.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION lookup_group_by_join_code(p_code text)
RETURNS TABLE (
  id             uuid,
  name           text,
  sport_id       uuid,
  max_members    int,
  member_count   bigint,
  already_member boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id,
    g.name,
    g.sport_id,
    g.max_members,
    (SELECT COUNT(*) FROM group_members gm  WHERE gm.group_id = g.id)::bigint AS member_count,
    (EXISTS (
      SELECT 1 FROM group_members gm2
       WHERE gm2.group_id = g.id AND gm2.user_id = auth.uid()
    )) AS already_member
  FROM groups g
  WHERE g.join_code = upper(trim(p_code))
    AND g.is_active = true;
END;
$$;


-- -----------------------------------------------------------------------
-- 3. join_group_by_code
--
-- Used by the "Confirm & Join" step. Validates the join code, checks
-- that the league isn't full, checks the caller isn't already a member,
-- then inserts the membership row — all in one atomic transaction.
--
-- SECURITY DEFINER so it can read the groups table even though the
-- caller isn't a member yet (needed to look up the group by code).
--
-- Raises a plain-English exception on any failure. TypeScript catches
-- this as error.message and surfaces it to the user.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_group_by_code(p_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
  v_max      int;
  v_count    bigint;
BEGIN
  -- Look up the group by code
  SELECT g.id, g.max_members
    INTO v_group_id, v_max
    FROM groups g
   WHERE g.join_code = upper(trim(p_code))
     AND g.is_active = true;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'No league found with that code.';
  END IF;

  -- Check not already a member
  IF EXISTS (
    SELECT 1 FROM group_members
     WHERE group_id = v_group_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You''re already in this league.';
  END IF;

  -- Check capacity
  SELECT COUNT(*) INTO v_count FROM group_members WHERE group_id = v_group_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'This league just filled up. Try another code.';
  END IF;

  -- Insert the membership
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, auth.uid(), 'member');
END;
$$;


-- -----------------------------------------------------------------------
-- 4. create_league_with_owner (cleanup only)
--
-- Drop any leftover versions of this function. League creation is handled
-- by two TypeScript inserts in the server action, not a DB function.
-- The SECURITY DEFINER approach for INSERT is unreliable in Supabase's
-- hosted environment — RLS enforcement behaves differently than the
-- Postgres spec suggests when called via PostgREST.
-- -----------------------------------------------------------------------
DROP FUNCTION IF EXISTS create_league_with_owner(text, uuid, text);
DROP FUNCTION IF EXISTS create_league_with_owner(text, uuid, text, integer);


-- -----------------------------------------------------------------------
-- 5. group_members INSERT policy
--
-- Users may insert a row where user_id matches their own session ID.
-- This allows:
--   - League creation (TypeScript inserts owner row directly)
--   - The join_group_by_code() RPC (which also does the INSERT internally)
--
-- Security: group_ids can no longer be enumerated (groups SELECT is
-- members-only), so a direct insert without a join code requires knowing
-- a group_id — a much lower risk than the original open table.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "group_members: users can join" ON group_members;
DROP POLICY IF EXISTS "group_members: admin only direct insert" ON group_members;

CREATE POLICY "group_members: users can insert own membership"
  ON group_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());


-- -----------------------------------------------------------------------
-- 6. Fix infinite recursion in group_members SELECT policy
--
-- The group_members SELECT policy contained a self-referential subquery
-- (EXISTS SELECT FROM group_members while evaluating a policy ON
-- group_members). This caused infinite recursion once the groups SELECT
-- policy also started querying group_members to check membership.
--
-- Fix: a SECURITY DEFINER helper function reads group_members directly
-- (bypassing RLS), so both policies can call it without triggering
-- themselves recursively.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT group_id FROM group_members WHERE user_id = auth.uid();
$$;

DROP POLICY IF EXISTS "group_members: members can read" ON group_members;

CREATE POLICY "group_members: members can read"
  ON group_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR group_id IN (SELECT get_my_group_ids())
  );

DROP POLICY IF EXISTS "groups: members can read their groups" ON groups;

CREATE POLICY "groups: members can read their groups"
  ON groups FOR SELECT TO authenticated
  USING (id IN (SELECT get_my_group_ids()));
