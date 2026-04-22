-- ============================================================
-- Migration: 20250423000000_admin_lock_fix.sql
-- Fixes a loophole where admins playing the game could move their
-- own picks or double downs after lock time.
-- Admins still bypass lock time to update points_earned, but they
-- cannot change picked_team or is_double_down on locked games.
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

  -- ---- Step 1: Look up game data from the games table ----
  SELECT kickoff_at, week_id
    INTO v_kickoff_at, v_week_id
    FROM games
   WHERE id = CASE
                WHEN TG_OP = 'DELETE' THEN OLD.game_id
                ELSE NEW.game_id
              END;

  IF v_kickoff_at IS NULL THEN
    RAISE EXCEPTION 'Pick rejected: game not found.';
  END IF;

  -- ---- Step 2 (Rule 2): Force week_id from the DB ----
  IF TG_OP <> 'DELETE' THEN
    NEW.week_id = v_week_id;
  END IF;

  -- ---- Step 3 (Rule 1): Enforce the lock time ----
  v_lock_time := v_kickoff_at - interval '15 minutes';

  IF now() >= v_lock_time THEN
    -- If the user is not an admin, they can't do anything after lock time.
    IF NOT is_admin() THEN
      RAISE EXCEPTION 'Pick rejected: this game is locked (locked at %).', v_lock_time;
    END IF;
    
    -- If the user IS an admin, they are only allowed to update points_earned (for scoring).
    -- They cannot insert new picks, delete picks, or change picked_team/is_double_down.
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Pick rejected: this game is locked (locked at %).', v_lock_time;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Pick rejected: this game is locked (locked at %).', v_lock_time;
    END IF;
    
    IF TG_OP = 'UPDATE' THEN
      IF NEW.picked_team IS DISTINCT FROM OLD.picked_team THEN
        RAISE EXCEPTION 'Pick rejected: admins cannot change picked_team after lock time.';
      END IF;
      IF NEW.is_double_down IS DISTINCT FROM OLD.is_double_down THEN
        RAISE EXCEPTION 'Pick rejected: admins cannot change double down status after lock time.';
      END IF;
    END IF;
  END IF;

  -- ---- Step 4 (Rule 3): Block user writes to points_earned ----
  IF TG_OP = 'UPDATE'
     AND NEW.points_earned IS DISTINCT FROM OLD.points_earned
     AND NOT is_admin()
  THEN
    RAISE EXCEPTION 'Pick rejected: users cannot change points_earned.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
