-- ============================================================
-- Migration: 20250423000000_admin_lock_fix.sql
--
-- Replaces the enforce_picks_integrity trigger function to fix
-- two separate issues in one authoritative definition:
--
--   Original issue (from 20250416000000_picks_integrity.sql):
--     Admins could move their own picks or double-downs after lock
--     because the original trigger had no admin-specific restriction.
--
--   Regression introduced by an earlier draft of this file:
--     The lock enforcement block calculated v_lock_time but never
--     used it — so ALL lock protection was accidentally removed for
--     regular users as well.
--
-- What this function enforces (in order):
--   Rule A — Lock time:
--     Before lock: anyone can INSERT/UPDATE/DELETE their picks.
--     After lock, non-admins: ALL operations blocked.
--     After lock, admins: UPDATE allowed ONLY for points_earned
--       (scoring). INSERT, DELETE, and changes to picked_team or
--       is_double_down are blocked even for admins.
--
--   Rule B — Force week_id from DB:
--     On INSERT or UPDATE, always overwrite the client-supplied
--     week_id with the authoritative value from the games table.
--
--   Rule C — Block users from writing points_earned:
--     On UPDATE, if points_earned changes and the caller is not
--     an admin, the write is rejected. Scoring is admin-only.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_picks_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_kickoff_at  TIMESTAMPTZ;
  v_week_id     UUID;
  v_lock_time   TIMESTAMPTZ;
BEGIN

  -- ---- Step 1: Look up the game's kickoff time and week ----
  -- For DELETE, NEW is null so we must read from OLD instead.
  SELECT kickoff_at, week_id
    INTO v_kickoff_at, v_week_id
    FROM games
   WHERE id = CASE
                WHEN TG_OP = 'DELETE' THEN OLD.game_id
                ELSE NEW.game_id
              END;

  -- If the game doesn't exist at all, reject the pick entirely.
  IF v_kickoff_at IS NULL THEN
    RAISE EXCEPTION 'Pick rejected: game not found.';
  END IF;

  -- ---- Step 2 (Rule B): Force week_id from the DB ----
  -- Always overwrite whatever the client sent with the real week_id
  -- from the games table. Prevents cross-week pick injection.
  IF TG_OP <> 'DELETE' THEN
    NEW.week_id = v_week_id;
  END IF;

  -- ---- Step 3 (Rule A): Enforce the lock window ----
  -- Games lock 15 minutes before kickoff. After that point,
  -- the rules below apply depending on the caller's role.
  v_lock_time := v_kickoff_at - interval '15 minutes';

  IF now() >= v_lock_time THEN

    IF NOT is_admin() THEN
      -- Regular users are completely blocked after lock.
      -- No INSERT, UPDATE, or DELETE of any kind.
      RAISE EXCEPTION 'Pick rejected: this game has locked.';
    END IF;

    -- Admins after lock: only allowed to UPDATE points_earned (scoring).
    -- They cannot create new picks, delete picks, or change which team
    -- was picked or whether a double-down was used.

    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Pick rejected: cannot create picks after a game locks.';
    END IF;

    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Pick rejected: cannot delete picks after a game locks.';
    END IF;

    -- For UPDATE: block changes to picked_team and is_double_down.
    -- Admins may still change points_earned (that's how scoring works).
    IF TG_OP = 'UPDATE' THEN
      IF NEW.picked_team IS DISTINCT FROM OLD.picked_team THEN
        RAISE EXCEPTION 'Pick rejected: cannot change picked_team after a game locks.';
      END IF;
      IF NEW.is_double_down IS DISTINCT FROM OLD.is_double_down THEN
        RAISE EXCEPTION 'Pick rejected: cannot change is_double_down after a game locks.';
      END IF;
    END IF;

  END IF;

  -- ---- Step 4 (Rule C): Block users from writing points_earned ----
  -- Only the scoring system (which runs as admin) may set points_earned.
  -- A regular user trying to award themselves points is rejected.
  IF TG_OP = 'UPDATE'
     AND NEW.points_earned IS DISTINCT FROM OLD.points_earned
     AND NOT is_admin()
  THEN
    RAISE EXCEPTION 'Pick rejected: users cannot change points_earned.';
  END IF;

  -- For DELETE triggers, PostgreSQL requires returning the OLD row.
  -- We've already raised an exception above if the delete should be
  -- blocked, so reaching here means we're allowing it (pre-lock window).
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
