-- ============================================================
-- THEO Pick'em App — Initial Database Schema
-- Migration: 20250408000000_initial_schema.sql
-- ============================================================
-- This file creates every table, constraint, index, and security
-- rule for the THEO college football pick'em app.
--
-- Run this once inside your Supabase SQL editor (or via the
-- Supabase CLI) to set up the entire database from scratch.
--
-- TABLE OF CONTENTS
--   1. Helper functions
--   2. profiles
--   3. sports
--   4. seasons
--   5. weeks
--   6. games
--   7. picks
--   8. groups
--   9. group_members
--  10. email_log
-- ============================================================


-- ============================================================
-- SECTION 1: HELPER FUNCTIONS
-- These are small reusable pieces of logic that our security
-- rules and triggers call throughout the file.
-- ============================================================

-- is_admin()
-- Returns true if the currently logged-in user has admin access.
-- "SECURITY DEFINER" means this function runs with full database
-- privileges so it can read the profiles table without being
-- blocked by Row Level Security.
-- "STABLE" means Postgres can cache the result within a single query,
-- which keeps leaderboard and admin-check queries fast.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND is_admin = true
  );
$$;


-- set_updated_at()
-- A trigger function. Whenever a row in a table is updated,
-- this automatically sets the updated_at column to the current time.
-- We attach this to the games and picks tables below.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- handle_new_user()
-- A trigger function that fires automatically when someone creates
-- a new Supabase Auth account. It creates a matching row in our
-- profiles table so the rest of the app has user info to work with.
-- The username is seeded from whatever they provide at signup,
-- falling back to the part of their email before the @ sign.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email_opt_in)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1)
    ),
    true  -- opted in by default, can turn off in profile settings
  );
  RETURN NEW;
END;
$$;

-- Wire the trigger to Supabase's internal auth.users table.
-- Every new signup automatically gets a profiles row.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- SECTION 2: PROFILES
-- Stores all user information beyond what Supabase Auth provides.
-- Supabase Auth handles passwords and login — this table holds
-- everything the app itself needs to know about a user.
-- One row per user, created automatically on signup (see trigger above).
-- ============================================================
CREATE TABLE profiles (
  -- id matches the user's ID in Supabase Auth.
  -- If the auth account is deleted, this row is deleted too (CASCADE).
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- username is the public-facing name shown on leaderboards and in groups.
  username      TEXT NOT NULL UNIQUE,

  -- display_name is an optional longer name (e.g., full name).
  display_name  TEXT,

  -- avatar_url points to the user's profile picture (stored elsewhere, e.g. Supabase Storage).
  avatar_url    TEXT,

  -- email_opt_in: true = user receives weekly preview emails.
  -- Default is true — users are opted in unless they turn it off in settings.
  email_opt_in  BOOLEAN NOT NULL DEFAULT true,

  -- is_admin: true = this user can manage games, set spreads, pull scores, send emails.
  is_admin      BOOLEAN NOT NULL DEFAULT false,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Turn on Row Level Security. Without this, every row is accessible
-- to anyone — this locks things down to the policies we define below.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Any logged-in user can read any profile.
-- Usernames must be public so they appear on leaderboards and in groups.
CREATE POLICY "profiles: authenticated users can read all"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Users can only create their own profile row (the trigger does this automatically,
-- but this policy is a safety net in case anything calls insert directly).
CREATE POLICY "profiles: users can insert own"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Users can only edit their own profile. Admins cannot change other users' profiles
-- (to avoid privilege abuse). Admins use the Supabase dashboard for that if needed.
CREATE POLICY "profiles: users can update own"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid());


-- ============================================================
-- SECTION 3: SPORTS
-- Defines each sport the app supports.
-- CFB is the first sport. Others (NFL, etc.) can be added later.
-- Each sport has its own completely separate leaderboards.
-- ============================================================
CREATE TABLE sports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- name is the human-readable sport name displayed in the UI.
  name       TEXT NOT NULL,        -- e.g. "College Football"

  -- slug is a short, lowercase identifier used in URLs and code.
  slug       TEXT NOT NULL UNIQUE, -- e.g. "cfb"

  -- is_active controls whether this sport is currently visible and playable.
  is_active  BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sports ENABLE ROW LEVEL SECURITY;

-- All logged-in users can see sports (needed to display sport tabs in the UI).
CREATE POLICY "sports: authenticated users can read"
  ON sports
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can create, edit, or remove sports.
CREATE POLICY "sports: admins can insert"
  ON sports
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "sports: admins can update"
  ON sports
  FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "sports: admins can delete"
  ON sports
  FOR DELETE
  TO authenticated
  USING (is_admin());


-- ============================================================
-- SECTION 4: SEASONS
-- One season per sport per year.
-- Leaderboards (weekly winner, season champion) are always
-- scoped to a single season. A sport can only have one
-- active season at a time.
-- ============================================================
CREATE TABLE seasons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which sport this season belongs to.
  sport_id   UUID NOT NULL REFERENCES sports(id),

  -- Human-readable name shown in the UI.
  name       TEXT NOT NULL,        -- e.g. "2025 CFB Season"

  year       INT NOT NULL,         -- e.g. 2025

  -- is_active: only one season per sport should be active at a time.
  -- The app uses this to know which season's games and leaderboards to show.
  is_active  BOOLEAN NOT NULL DEFAULT false,

  starts_at  DATE NOT NULL,
  ends_at    DATE NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup: find all seasons for a given sport.
CREATE INDEX idx_seasons_sport_id  ON seasons (sport_id);

-- Fast lookup: find whichever season is currently active.
CREATE INDEX idx_seasons_is_active ON seasons (is_active);

ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seasons: authenticated users can read"
  ON seasons
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "seasons: admins can insert"
  ON seasons
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "seasons: admins can update"
  ON seasons
  FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "seasons: admins can delete"
  ON seasons
  FOR DELETE
  TO authenticated
  USING (is_admin());


-- ============================================================
-- SECTION 5: WEEKS
-- Each season is broken into numbered pick weeks.
-- Note: there are no open/close timestamps on the week itself.
-- Pick windows lock per-game (15 minutes before each game's kickoff),
-- not at the week level.
-- ============================================================
CREATE TABLE weeks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which season this week belongs to.
  season_id    UUID NOT NULL REFERENCES seasons(id),

  -- week_number is used for ordering. Must be unique within a season.
  week_number  INT NOT NULL,

  -- label is the display name shown in the UI.
  label        TEXT NOT NULL,      -- e.g. "Week 1", "Week 9"

  -- is_complete is set to true by an admin once all games in this week are scored.
  -- The app uses this to finalize the weekly leaderboard for that week.
  is_complete  BOOLEAN NOT NULL DEFAULT false,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevents accidentally creating two "Week 1" entries in the same season.
  UNIQUE (season_id, week_number)
);

-- Fast lookup: find all weeks for a given season.
CREATE INDEX idx_weeks_season_id ON weeks (season_id);

ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weeks: authenticated users can read"
  ON weeks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "weeks: admins can insert"
  ON weeks
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "weeks: admins can update"
  ON weeks
  FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "weeks: admins can delete"
  ON weeks
  FOR DELETE
  TO authenticated
  USING (is_admin());


-- ============================================================
-- SECTION 6: GAMES
-- The individual matchups users pick each week.
-- Target is 10 games per week, but the count is flexible.
--
-- IMPORTANT: Pick lock time is calculated in application code as:
--   kickoff_at - interval '15 minutes'
-- It is not stored in the database to avoid duplication.
--
-- Spreads are always set in half-point increments (e.g. -7.5)
-- so a push (game lands exactly on the spread) is mathematically
-- impossible, but the schema handles it gracefully just in case.
-- ============================================================
CREATE TABLE games (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which week this game belongs to.
  week_id        UUID NOT NULL REFERENCES weeks(id),

  home_team      TEXT NOT NULL,    -- e.g. "Alabama"
  away_team      TEXT NOT NULL,    -- e.g. "Georgia"

  -- spread: the point handicap. Negative means the home team is favored.
  -- Example: -7.5 means home team must win by 8 or more for the 'home' pick to win.
  -- Example: +3.5 means the home team can lose by up to 3 and still cover.
  -- Always use half-point values (7.5, 3.5, etc.) to prevent pushes.
  spread         NUMERIC(4,1) NOT NULL,

  -- spread_favors: a plain-English label for which side the spread is on.
  -- Derived from the spread sign but stored explicitly to avoid confusion in the UI.
  spread_favors  TEXT NOT NULL CHECK (spread_favors IN ('home', 'away')),

  -- point_value: how many points a correct pick on this game is worth.
  -- Admin sets this (1 = least important game, 10 = most important game that week).
  point_value    INT NOT NULL CHECK (point_value BETWEEN 1 AND 10),

  -- kickoff_at: the scheduled start time of the game.
  -- Pick window for this game locks at: kickoff_at - 15 minutes.
  kickoff_at     TIMESTAMPTZ NOT NULL,

  -- espn_game_id: the unique ID ESPN uses for this game.
  -- Used to fetch live scores and final results from the ESPN API.
  espn_game_id   TEXT UNIQUE,

  -- Scores: null until the game begins.
  home_score     INT,
  away_score     INT,

  -- status tracks the game's lifecycle:
  --   'scheduled'   = not yet started
  --   'in_progress' = currently being played (live scores visible)
  --   'final'       = game over, ATS result recorded
  --   'void'        = game cancelled or postponed after picks locked;
  --                   no points awarded to anyone
  status         TEXT NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'in_progress', 'final', 'void')),

  -- ats_result: who covered the spread, filled in when status = 'final'.
  --   'home'  = home team covered (pick 'home' to win)
  --   'away'  = away team covered (pick 'away' to win)
  --   'push'  = landed exactly on spread (no points awarded; shouldn't happen with half-points)
  --   'void'  = game was cancelled (no points awarded)
  --   null    = game not yet finished
  ats_result     TEXT CHECK (ats_result IN ('home', 'away', 'push', 'void')),

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Automatically update updated_at whenever an admin edits a game row
-- (e.g., updating the score or ats_result after the game finishes).
CREATE TRIGGER games_set_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Fast lookup: load all games for a week (the main picks page).
CREATE INDEX idx_games_week_id    ON games (week_id);

-- Fast lookup: find a game by its ESPN ID during score refresh.
CREATE INDEX idx_games_espn_id    ON games (espn_game_id);

-- Fast lookup: find all in-progress or final games (admin scoring panel).
CREATE INDEX idx_games_status     ON games (status);

-- Fast lookup: sort games by kickoff time within a week.
CREATE INDEX idx_games_kickoff_at ON games (kickoff_at);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- All logged-in users can see games (to make their picks).
CREATE POLICY "games: authenticated users can read"
  ON games
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can create, edit, or void games.
CREATE POLICY "games: admins can insert"
  ON games
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "games: admins can update"
  ON games
  FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "games: admins can delete"
  ON games
  FOR DELETE
  TO authenticated
  USING (is_admin());


-- ============================================================
-- SECTION 7: PICKS
-- One row per user per game. The heart of the entire app.
--
-- SCORING RULES (enforced in application code, recorded here):
--   Correct pick (no double-down):  +point_value
--   Wrong pick   (no double-down):   0
--   Correct pick (double-down):     +point_value * 2
--   Wrong pick   (double-down):     -point_value * 2
--   No pick submitted:               0 (row simply doesn't exist)
--   Game void:                       0 (points_earned set to 0)
--   Season total CAN go negative.
--
-- LOCK RULE (enforced in application code):
--   Users can create or update a pick any time before
--   that specific game's kickoff_at - 15 minutes.
--   After that, the pick is locked and cannot change.
--
-- DOUBLE-DOWN RULE:
--   One double-down per user per week on any game in that week.
--   The partial unique index below enforces this at the database level.
-- ============================================================
CREATE TABLE picks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who made this pick.
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Which game they picked.
  game_id         UUID NOT NULL REFERENCES games(id),

  -- week_id is copied from the game row. Storing it here avoids
  -- a JOIN through games every time we run a leaderboard query.
  week_id         UUID NOT NULL REFERENCES weeks(id),

  -- The team they chose to cover the spread.
  picked_team     TEXT NOT NULL CHECK (picked_team IN ('home', 'away')),

  -- is_double_down: true = this user staked their one double-down on this game.
  -- The partial unique index below ensures only one per user per week.
  is_double_down  BOOLEAN NOT NULL DEFAULT false,

  -- points_earned is null until the game is scored.
  -- It is filled in by the admin scoring process and can be negative
  -- (if the user double-downed on a wrong pick).
  points_earned   NUMERIC(5,1),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The database enforces: one pick per user per game, no exceptions.
  UNIQUE (user_id, game_id)
);

-- Automatically update updated_at when a user changes their pick.
CREATE TRIGGER picks_set_updated_at
  BEFORE UPDATE ON picks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- CRITICAL: Enforces the one-double-down-per-week rule at the database level.
-- A "partial unique index" only applies to rows where is_double_down = true.
-- This means: for any given user + week combination, at most one row can
-- have is_double_down = true. The database will reject a second one.
CREATE UNIQUE INDEX idx_picks_one_double_down_per_week
  ON picks (user_id, week_id)
  WHERE is_double_down = true;

-- Fast lookup: sum a specific user's points for a specific week (leaderboard).
CREATE INDEX idx_picks_user_week ON picks (user_id, week_id);

-- Fast lookup: when scoring a game, find all picks for that game to fill in points_earned.
CREATE INDEX idx_picks_game_id   ON picks (game_id);

-- Fast lookup: aggregate all picks for a week across all users (weekly leaderboard).
CREATE INDEX idx_picks_week_id   ON picks (week_id);

ALTER TABLE picks ENABLE ROW LEVEL SECURITY;

-- RULE 1: Users can always see their own picks, regardless of game status.
CREATE POLICY "picks: users can read own picks"
  ON picks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RULE 2: Users can see OTHER people's picks ONLY after that game has kicked off.
-- This prevents users from waiting to see what others pick before submitting their own.
-- The check joins to the games table to compare kickoff_at against the current time.
CREATE POLICY "picks: users can read others picks after kickoff"
  ON picks
  FOR SELECT
  TO authenticated
  USING (
    user_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM games
      WHERE games.id = picks.game_id
        AND games.kickoff_at <= now()
    )
  );

-- RULE 3: Admins can read all picks at any time (needed for scoring and admin panel).
CREATE POLICY "picks: admins can read all"
  ON picks
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Users can only submit picks for themselves.
CREATE POLICY "picks: users can insert own"
  ON picks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can only update their own picks.
-- Note: whether the pick is still before the lock time is enforced in
-- application code (checking kickoff_at - 15 minutes), not in this policy.
CREATE POLICY "picks: users can update own"
  ON picks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Users can delete (withdraw) their own picks before the lock.
CREATE POLICY "picks: users can delete own"
  ON picks
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can update any pick (needed to fill in points_earned after scoring).
CREATE POLICY "picks: admins can update all"
  ON picks
  FOR UPDATE
  TO authenticated
  USING (is_admin());


-- ============================================================
-- SECTION 8: GROUPS
-- Friend groups with a shared leaderboard and group chat.
-- Any logged-in user can create a group.
-- Groups span all sports — the group leaderboard shows points
-- from all sports filtered to members of that group.
-- ============================================================
CREATE TABLE groups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name              TEXT NOT NULL,

  description       TEXT,

  -- join_code: the short code friends share to join this group.
  -- Example: "XK9T2A". Must be unique across all groups.
  -- The application generates this randomly when a group is created.
  join_code         TEXT NOT NULL UNIQUE,

  -- created_by: the user who created the group. They start as 'owner'.
  created_by        UUID NOT NULL REFERENCES profiles(id),

  -- stream_channel_id: the ID assigned by the Stream Chat service
  -- for this group's dedicated chat room. Null until the channel is created.
  stream_channel_id TEXT,

  avatar_url        TEXT,

  -- max_members: hard cap on how many users can join this group.
  -- Default is 50, but can be changed per group.
  max_members       INT NOT NULL DEFAULT 50,

  -- is_active: set to false to deactivate a group without deleting it.
  -- Deactivated groups are hidden from the UI but data is preserved.
  is_active         BOOLEAN NOT NULL DEFAULT true,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- All logged-in users can see groups (needed to look up a group by join code).
CREATE POLICY "groups: authenticated users can read"
  ON groups
  FOR SELECT
  TO authenticated
  USING (true);

-- Any logged-in user can create a group.
-- The created_by column must match their own user ID.
CREATE POLICY "groups: users can create own"
  ON groups
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Group owners and admins can edit group details (name, description, etc.).
CREATE POLICY "groups: owner or admin can update"
  ON groups
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR is_admin());

-- Only admins can hard-delete groups.
-- Owners should use is_active = false to deactivate instead.
CREATE POLICY "groups: admins can delete"
  ON groups
  FOR DELETE
  TO authenticated
  USING (is_admin());


-- ============================================================
-- SECTION 9: GROUP_MEMBERS
-- Tracks which users belong to which groups.
-- One row per user per group.
-- Users can belong to multiple groups simultaneously.
-- ============================================================
CREATE TABLE group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- If the group is deleted, remove all member rows automatically.
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,

  -- If the user's account is deleted, remove their memberships automatically.
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- role: 'owner' can edit the group and remove other members.
  --        'member' is a regular participant.
  -- The creator of the group is automatically assigned 'owner'.
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),

  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A user can only appear once in any given group.
  UNIQUE (group_id, user_id)
);

-- Fast lookup: list all members of a specific group.
CREATE INDEX idx_group_members_group_id ON group_members (group_id);

-- Fast lookup: list all groups a specific user belongs to.
CREATE INDEX idx_group_members_user_id  ON group_members (user_id);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Members of a group can see who else is in that group.
-- A user can also always see their own memberships.
CREATE POLICY "group_members: members can read"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    -- They are reading their own membership row
    user_id = auth.uid()
    OR
    -- Or they are already a member of the same group
    EXISTS (
      SELECT 1
      FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
    )
  );

-- Users can add themselves to a group (after validating the join code in app code).
CREATE POLICY "group_members: users can join"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Group owners and admins can promote/demote member roles.
CREATE POLICY "group_members: owner or admin can update"
  ON group_members
  FOR UPDATE
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'owner'
    )
  );

-- Users can leave a group themselves.
-- Group owners can remove any member.
-- Admins can remove any member from any group.
CREATE POLICY "group_members: owner can remove or user can leave"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (
    -- User is removing themselves (leaving)
    user_id = auth.uid()
    OR
    -- Site admin
    is_admin()
    OR
    -- Group owner removing someone else
    EXISTS (
      SELECT 1
      FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'owner'
    )
  );


-- ============================================================
-- SECTION 10: EMAIL_LOG
-- Records every weekly preview email that is sent.
-- This prevents an admin from accidentally sending the same
-- week's email twice. Only admins can read or write this table.
-- ============================================================
CREATE TABLE email_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which week's preview email this is.
  week_id          UUID NOT NULL REFERENCES weeks(id),

  -- Which admin clicked "Send".
  sent_by          UUID NOT NULL REFERENCES profiles(id),

  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- How many opted-in users received the email.
  recipient_count  INT NOT NULL,

  -- The subject line of the email that was sent.
  subject          TEXT NOT NULL
);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view or write email send history.
-- "FOR ALL" covers SELECT, INSERT, UPDATE, and DELETE in one policy.
CREATE POLICY "email_log: admins only"
  ON email_log
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());


-- ============================================================
-- END OF MIGRATION
-- ============================================================
-- Summary of what was created:
--   Tables:    profiles, sports, seasons, weeks, games,
--              picks, groups, group_members, email_log
--   Functions: is_admin(), set_updated_at(), handle_new_user()
--   Triggers:  on_auth_user_created (profiles auto-create on signup)
--              games_set_updated_at, picks_set_updated_at
--   Indexes:   see inline comments above each CREATE INDEX
--   RLS:       enabled on all 9 tables with per-table policies
-- ============================================================
