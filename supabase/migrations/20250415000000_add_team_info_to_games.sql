-- ============================================================
-- Migration: 20250415000000_add_team_info_to_games.sql
-- Adds team logo URLs and short display names to the games table.
--
-- These columns are populated automatically when the admin creates
-- or updates a game by entering an ESPN game ID. Storing them in
-- the database means the picks page never has to call ESPN at
-- runtime — it just reads from our own database, which is fast.
--
-- All four columns are nullable (TEXT with no NOT NULL) so that
-- existing games don't break and so a failed ESPN lookup still
-- lets the game be created (the picks page falls back to the
-- full team name if short name is null, and shows initials if
-- the logo URL is null).
-- ============================================================

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS home_short_name TEXT,  -- e.g. "Ohio State"
  ADD COLUMN IF NOT EXISTS away_short_name TEXT,  -- e.g. "Michigan"
  ADD COLUMN IF NOT EXISTS home_logo_url   TEXT,  -- ESPN CDN URL for home team logo
  ADD COLUMN IF NOT EXISTS away_logo_url   TEXT;  -- ESPN CDN URL for away team logo
