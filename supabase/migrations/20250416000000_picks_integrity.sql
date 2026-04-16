-- ============================================================
-- Migration: 20250416000000_picks_integrity.sql
--
-- Adds database-level enforcement for three pick integrity rules.
-- Previously these were only enforced in the React UI (GameCard.tsx),
-- meaning anyone who called the Supabase API directly could bypass them.
--
-- Rule 1 (Lock time): Picks cannot be inserted, changed, or deleted
--   after a game locks (15 minutes before kickoff). This matches the
--   exact same lock logic in GameCard.tsx: kickoff_at - 15 minutes.
--
-- Rule 2 (week_id): The week_id on a pick is always set from the
--   games table, never trusted from the client. A malicious user
--   could supply a wrong week_id to corrupt double-down counts and
--   leaderboard scoring.
--
-- Rule 3 (points_earned): Regular users cannot write to points_earned.
--   Only admins (the scoring system) may set that value. Previously
--   the UPDATE policy allowed any column, so a user could give
--   themselves arbitrary points.
--
-- Admins bypass all three rules so scoring can proceed normally.
-- The is_admin() function is already defined in the initial schema —
-- it reads from the profiles table (SECURITY DEFINER) and safely
-- identifies whether the current session belongs to an admin.
-- ============================================================


-- ============================================================
-- TRIGGER FUNCTION: enforce_picks_integrity
--
-- Runs BEFORE every INSERT, UPDATE, or DELETE on the picks table.
-- "BEFORE" means we can still modify the row (NEW) before it is
-- written, and raise an exception to cancel the write entirely.
-- "FOR EACH ROW" means it fires once per affected row.
--
-- DECLARE: Postgres lets us declare variables at the top of the
-- function. We use these to store values we look up from the DB.
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_picks_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_kickoff_at  TIMESTAMPTZ;  -- The game's scheduled kickoff time
  v_week_id     UUID;         -- The game's week (authoritative, from the DB)
  v_lock_time   TIMESTAMPTZ;  -- Calculated: kickoff_at minus 15 minutes
BEGIN

  -- ---- Step 1: Look up game data from the games table ----
  -- For INSERT and UPDATE, the new row being written is in NEW.
  -- For DELETE, the row being removed is in OLD (NEW doesn't exist).
  -- We use a CASE here to pick the right game_id for each operation.
  SELECT kickoff_at, week_id
    INTO v_kickoff_at, v_week_id
    FROM games
   WHERE id = CASE
                WHEN TG_OP = 'DELETE' THEN OLD.game_id
                ELSE NEW.game_id
              END;

  -- If the game doesn't exist, the SELECT above returns no rows and
  -- v_kickoff_at will be NULL. In practice this can't happen because
  -- the FK constraint on picks.game_id guarantees the game exists.
  -- But we guard anyway to avoid a confusing NULL comparison below.
  IF v_kickoff_at IS NULL THEN
    RAISE EXCEPTION 'Pick rejected: game not found.';
  END IF;

  -- ---- Step 2 (Rule 2): Force week_id from the DB ----
  -- We overwrite whatever week_id the client sent with the
  -- authoritative value from the games table. This applies to
  -- INSERT and UPDATE only (there's nothing to overwrite on DELETE).
  IF TG_OP <> 'DELETE' THEN
    NEW.week_id = v_week_id;
  END IF;

  -- ---- Step 3 (Rule 1): Enforce the lock time ----
  -- Lock time = kickoff_at minus 15 minutes, matching GameCard.tsx.
  -- If we're past the lock time AND the current user is not an admin,
  -- reject the write entirely by raising an exception.
  v_lock_time := v_kickoff_at - interval '15 minutes';

  IF now() >= v_lock_time AND NOT is_admin() THEN
    RAISE EXCEPTION
      'Pick rejected: this game is locked (locked at %).', v_lock_time;
  END IF;

  -- ---- Step 4 (Rule 3): Block user writes to points_earned ----
  -- On UPDATE, if the user is trying to change points_earned and is
  -- not an admin, reject it. IS DISTINCT FROM handles NULLs correctly
  -- (unlike =, which returns NULL when either side is NULL).
  -- This check only applies to UPDATE because on INSERT the scoring
  -- system hasn't run yet, so points_earned starts as NULL.
  IF TG_OP = 'UPDATE'
     AND NEW.points_earned IS DISTINCT FROM OLD.points_earned
     AND NOT is_admin()
  THEN
    RAISE EXCEPTION
      'Pick rejected: users cannot change points_earned.';
  END IF;

  -- ---- All checks passed ----
  -- Return NEW so Postgres continues with the write.
  -- For DELETE, we return OLD (Postgres ignores the return value for
  -- DELETE triggers but the function must return a row).
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- TRIGGER: picks_enforce_integrity
--
-- Attaches the function above to the picks table.
-- Fires BEFORE every INSERT, UPDATE, and DELETE on each row.
--
-- Why BEFORE (not AFTER)?
--   BEFORE triggers can modify the row (via NEW) and cancel the
--   write by raising an exception. AFTER triggers cannot do either.
--
-- Why not change the RLS policies instead?
--   RLS policies control WHO can access rows (e.g., own user only).
--   Triggers control WHAT and WHEN writes are allowed (business rules).
--   Both layers serve different purposes and work together.
-- ============================================================
DROP TRIGGER IF EXISTS picks_enforce_integrity ON picks;

CREATE TRIGGER picks_enforce_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON picks
  FOR EACH ROW
  EXECUTE FUNCTION enforce_picks_integrity();
