-- ============================================================
-- One-time repair: is_double_down out of sync with points_earned
--
-- Symptom: points_earned shows a double-down loss (−2×point_value)
--          while is_double_down = false, often alongside another pick
--          in the same week still marked is_double_down = true.
--
-- Cause (typical): client upsert on team change sent is_double_down: false
--                  and overwrote the DB value (see PicksClient fix).
--
-- This migration:
--   1) Infers the correct is_double_down from points_earned + final ATS
--   2) If more than one pick per (user_id, week_id) should be doubled,
--      keeps exactly one (prefers the double-down *loss*, then largest |pts|)
--   3) Recomputes points_earned from the repaired flags for all scored picks
--      on final games (keeps math consistent with src/lib/scoring.ts)
--
-- Uses WITH + UPDATE only (no TEMP TABLE) so the Supabase SQL editor
-- does not warn about RLS on a staging table.
-- ============================================================

WITH base AS (
  SELECT
    p.id,
    p.user_id,
    p.week_id,
    p.points_earned,
    p.is_double_down AS old_is_double_down,
    g.point_value,
    p.picked_team::text AS picked_team,
    g.ats_result::text AS ats_result
  FROM picks p
  INNER JOIN games g ON g.id = p.game_id
  WHERE p.points_earned IS NOT NULL
    AND g.status = 'final'
    AND g.ats_result IS NOT NULL
    AND g.ats_result NOT IN ('push', 'void')
),
calc AS (
  SELECT
    *,
    (picked_team = ats_result) AS is_correct,
    CASE WHEN picked_team = ats_result THEN point_value ELSE 0 END AS exp_no_dd,
    CASE WHEN picked_team = ats_result THEN 2 * point_value ELSE -2 * point_value END AS exp_dd
  FROM base
),
inferred AS (
  SELECT
    *,
    CASE
      WHEN points_earned = exp_dd AND points_earned IS DISTINCT FROM exp_no_dd THEN TRUE
      WHEN points_earned = exp_no_dd AND points_earned IS DISTINCT FROM exp_dd THEN FALSE
      WHEN points_earned < 0 THEN TRUE
      ELSE old_is_double_down
    END AS raw_dd
  FROM calc
),
multi AS (
  SELECT user_id, week_id
  FROM inferred
  WHERE raw_dd = TRUE
  GROUP BY user_id, week_id
  HAVING COUNT(*) > 1
),
keeper AS (
  SELECT DISTINCT ON (i.user_id, i.week_id)
    i.id AS keeper_id
  FROM inferred i
  INNER JOIN multi m ON m.user_id = i.user_id AND m.week_id = i.week_id
  WHERE i.raw_dd = TRUE
  ORDER BY
    i.user_id,
    i.week_id,
    CASE WHEN i.points_earned < 0 THEN 0 ELSE 1 END,
    ABS(i.points_earned) DESC NULLS LAST,
    i.id
),
targets AS (
  SELECT
    i.id,
    CASE
      WHEN m.user_id IS NULL THEN i.raw_dd
      WHEN i.id = k.keeper_id THEN TRUE
      ELSE FALSE
    END AS new_is_double_down
  FROM inferred i
  LEFT JOIN multi m ON m.user_id = i.user_id AND m.week_id = i.week_id
  LEFT JOIN keeper k ON k.keeper_id = i.id
)
UPDATE picks p
SET is_double_down = t.new_is_double_down
FROM targets t
WHERE p.id = t.id
  AND p.is_double_down IS DISTINCT FROM t.new_is_double_down;

-- Recompute points_earned for every scored pick on a final game (idempotent if already consistent)
UPDATE picks p
SET points_earned = (
  CASE
    WHEN g.ats_result::text IN ('push', 'void') THEN 0
    WHEN p.picked_team::text = g.ats_result::text THEN
      CASE WHEN p.is_double_down THEN 2 * g.point_value ELSE g.point_value END
    ELSE
      CASE WHEN p.is_double_down THEN -2 * g.point_value ELSE 0 END
  END
)
FROM games g
WHERE p.game_id = g.id
  AND g.status = 'final'
  AND g.ats_result IS NOT NULL
  AND p.points_earned IS NOT NULL;
