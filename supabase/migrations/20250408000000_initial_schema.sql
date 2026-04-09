-- ============================================================
-- THEO Pick'em App — Initial Database Schema
-- Migration: 20250408000000_initial_schema.sql
-- ============================================================
-- This file is structured in four phases so that nothing is
-- referenced before it exists:
--
--   PHASE 1 — Tables    (created in foreign-key dependency order)
--   PHASE 2 — Functions (can now reference tables safely)
--   PHASE 3 — Triggers  (attach functions to tables)
--   PHASE 4 — RLS       (enable security and define policies)
-- ============================================================


-- ============================================================
-- PHASE 1: TABLES
-- Created in dependency order: tables with no foreign keys first,
-- then tables that reference them, and so on.
-- ============================================================


-- ----------------------------------------------------------
-- TABLE: profiles
-- Stores all user information beyond what Supabase Auth provides.
-- One row per user. The id matches auth.users so the two are linked.
-- Rows are created automatically on signup (trigger added in Phase 3).
-- ----------------------------------------------------------
CREATE TABLE profiles (
  -- id matches the user's ID in Supabase Auth.
  -- ON DELETE CASCADE: if the auth account is deleted, this row is too.
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- username is the public-facing name shown on leaderboards and in groups.
  username      TEXT NOT NULL UNIQUE,

  -- display_name is an optional longer name (e.g., a full name).
  display_name  TEXT,

  -- avatar_url points to the user's profile picture.
  avatar_url    TEXT,

  -- email_opt_in: true = user wants weekly preview emails.
  -- Default is TRUE — users are opted in and can turn it off in settings.
  email_opt_in  BOOLEAN NOT NULL DEFAULT true,

  -- is_admin: true = this user can manage games, set scores, and send emails.
  is_admin      BOOLEAN NOT NULL DEFAULT false,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------
-- TABLE: sports
-- Defines each sport the app supports. CFB is first; others come later.
-- Each sport has its own completely separate leaderboards.
-- ----------------------------------------------------------
CREATE TABLE sports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,         -- e.g. "College Football"
  slug       TEXT NOT NULL UNIQUE,  -- e.g. "cfb" — used in URLs and code
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------
-- TABLE: seasons
-- One season per sport per year (e.g., "2025 CFB Season").
-- All leaderboards are scoped to a season.
-- ----------------------------------------------------------
CREATE TABLE seasons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id   UUID NOT NULL REFERENCES sports(id),
  name       TEXT NOT NULL,         -- e.g. "2025 CFB Season"
  year       INT NOT NULL,
  -- Only one season per sport should be active at a time.
  is_active  BOOLEAN NOT NULL DEFAULT false,
  starts_at  DATE NOT NULL,
  ends_at    DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_seasons_sport_id  ON seasons (sport_id);
CREATE INDEX idx_seasons_is_active ON seasons (is_active);


-- ----------------------------------------------------------
-- TABLE: weeks
-- Each season is broken into numbered pick weeks.
-- Pick windows lock per-game (kickoff_at - 15 min), not per-week,
-- so there are no open/close timestamps on this table.
-- ----------------------------------------------------------
CREATE TABLE weeks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id    UUID NOT NULL REFERENCES seasons(id),
  week_number  INT NOT NULL,
  label        TEXT NOT NULL,       -- e.g. "Week 1"
  -- is_complete is set by an admin once all games in the week are scored.
  is_complete  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevents two "Week 1" entries in the same season.
  UNIQUE (season_id, week_number)
);

CREATE INDEX idx_weeks_season_id ON weeks (season_id);


-- ----------------------------------------------------------
-- TABLE: games
-- The individual matchups users pick each week. Target is 10 per week.
--
-- Lock time = kickoff_at - 15 minutes (calculated in app code, not stored).
-- Spreads are always set in half-point increments (e.g., -7.5) so a push
-- is mathematically impossible, but the schema handles it gracefully.
-- ----------------------------------------------------------
CREATE TABLE games (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id        UUID NOT NULL REFERENCES weeks(id),
  home_team      TEXT NOT NULL,
  away_team      TEXT NOT NULL,

  -- spread: negative = home team favored by that many points.
  -- e.g., -7.5 means home must win by 8+ for the 'home' pick to win.
  spread         NUMERIC(4,1) NOT NULL,

  -- spread_favors: which side the spread benefits, stored explicitly for UI clarity.
  spread_favors  TEXT NOT NULL CHECK (spread_favors IN ('home', 'away')),

  -- point_value: how many points a correct pick on this game is worth (1–10).
  -- Admin assigns this — higher value = more important game that week.
  point_value    INT NOT NULL CHECK (point_value BETWEEN 1 AND 10),

  -- kickoff_at: scheduled start time. Pick lock = kickoff_at - 15 minutes.
  kickoff_at     TIMESTAMPTZ NOT NULL,

  -- espn_game_id: used to fetch live scores from the ESPN unofficial API.
  espn_game_id   TEXT UNIQUE,

  -- Scores are null until the game begins.
  home_score     INT,
  away_score     INT,

  -- status tracks the game lifecycle:
  --   'scheduled'   = not yet started
  --   'in_progress' = being played (live scores visible)
  --   'final'       = game over, ats_result recorded
  --   'void'        = cancelled/postponed after picks locked; no points awarded
  status         TEXT NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'in_progress', 'final', 'void')),

  -- ats_result: who covered the spread, filled in when status = 'final'.
  --   'home' = home team covered  |  'away' = away team covered
  --   'push' = landed on spread (shouldn't happen with half-point spreads)
  --   'void' = game cancelled (no points awarded)
  --   null   = game not yet finished
  ats_result     TEXT CHECK (ats_result IN ('home', 'away', 'push', 'void')),

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_games_week_id    ON games (week_id);
CREATE INDEX idx_games_espn_id    ON games (espn_game_id);
CREATE INDEX idx_games_status     ON games (status);
CREATE INDEX idx_games_kickoff_at ON games (kickoff_at);


-- ----------------------------------------------------------
-- TABLE: picks
-- One row per user per game. The heart of the app.
--
-- SCORING RULES (enforced in app code, recorded here for reference):
--   Correct (no double-down):  +point_value
--   Wrong   (no double-down):   0
--   Correct (double-down):     +point_value * 2
--   Wrong   (double-down):     -point_value * 2
--   No pick submitted:          0 (row simply doesn't exist)
--   Game void:                  0 (points_earned set to 0)
--   Season total CAN go negative.
-- ----------------------------------------------------------
CREATE TABLE picks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id         UUID NOT NULL REFERENCES games(id),

  -- week_id is copied from the game row to avoid a JOIN in every leaderboard query.
  week_id         UUID NOT NULL REFERENCES weeks(id),

  picked_team     TEXT NOT NULL CHECK (picked_team IN ('home', 'away')),

  -- is_double_down: the partial unique index below enforces only one per user per week.
  is_double_down  BOOLEAN NOT NULL DEFAULT false,

  -- points_earned is null until the game is scored. Can be negative.
  points_earned   NUMERIC(5,1),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One pick per user per game — enforced at the database level.
  UNIQUE (user_id, game_id)
);

-- Enforces the one-double-down-per-week rule at the database level.
-- A partial unique index only applies to rows where is_double_down = true,
-- so at most one such row can exist for any (user_id, week_id) combination.
CREATE UNIQUE INDEX idx_picks_one_double_down_per_week
  ON picks (user_id, week_id)
  WHERE is_double_down = true;

CREATE INDEX idx_picks_user_week ON picks (user_id, week_id);
CREATE INDEX idx_picks_game_id   ON picks (game_id);
CREATE INDEX idx_picks_week_id   ON picks (week_id);


-- ----------------------------------------------------------
-- TABLE: groups
-- Friend groups with a shared leaderboard and group chat.
-- Any logged-in user can create a group. Groups span all sports.
-- ----------------------------------------------------------
CREATE TABLE groups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT,

  -- join_code: the short code friends share to join (e.g., "XK9T2A").
  -- Generated randomly by the app when a group is created.
  join_code         TEXT NOT NULL UNIQUE,

  -- The user who created the group; automatically assigned 'owner' role.
  created_by        UUID NOT NULL REFERENCES profiles(id),

  -- stream_channel_id: the Stream Chat service ID for this group's chat room.
  stream_channel_id TEXT,

  avatar_url        TEXT,

  -- max_members: hard cap on group size. Default 50, configurable per group.
  max_members       INT NOT NULL DEFAULT 50,

  -- is_active: set false to deactivate without deleting (preserves history).
  is_active         BOOLEAN NOT NULL DEFAULT true,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------
-- TABLE: group_members
-- Links users to groups. One row per user per group.
-- Users can belong to multiple groups simultaneously.
-- ----------------------------------------------------------
CREATE TABLE group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE CASCADE: removing a group removes all its member rows.
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,

  -- ON DELETE CASCADE: deleting a user removes their group memberships.
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- 'owner' can edit the group and remove members.
  -- 'member' is a regular participant.
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),

  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A user can only appear once per group.
  UNIQUE (group_id, user_id)
);

CREATE INDEX idx_group_members_group_id ON group_members (group_id);
CREATE INDEX idx_group_members_user_id  ON group_members (user_id);


-- ----------------------------------------------------------
-- TABLE: email_log
-- Records every weekly preview email sent by an admin.
-- Prevents accidentally sending the same week's email twice.
-- ----------------------------------------------------------
CREATE TABLE email_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id          UUID NOT NULL REFERENCES weeks(id),
  sent_by          UUID NOT NULL REFERENCES profiles(id),
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_count  INT NOT NULL,
  subject          TEXT NOT NULL
);


-- ============================================================
-- PHASE 2: FUNCTIONS
-- Now that all tables exist, functions can safely reference them.
-- ============================================================


-- ----------------------------------------------------------
-- set_updated_at()
-- Trigger function: sets updated_at to now() whenever a row changes.
-- Attached to games and picks tables in Phase 3.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------
-- handle_new_user()
-- Trigger function: fires when someone creates a Supabase Auth account.
-- Automatically inserts a matching row into the profiles table.
-- The username is seeded from signup metadata, falling back to the
-- portion of their email address before the @ sign.
-- ----------------------------------------------------------
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
    true
  );
  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------
-- is_admin()
-- Returns true if the currently logged-in user has admin access.
-- Called inside RLS policies in Phase 4.
--
-- SECURITY DEFINER: runs with full database privileges so it can
-- read the profiles table without being blocked by its own RLS.
-- STABLE: Postgres can cache the result within a single query,
-- making admin-check lookups faster.
-- ----------------------------------------------------------
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


-- ============================================================
-- PHASE 3: TRIGGERS
-- Attach functions to tables. All referenced functions and
-- tables now exist so this phase cannot fail.
-- ============================================================

-- Auto-create a profiles row whenever someone signs up.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at whenever a game row is changed
-- (e.g., admin updates the score or ats_result).
CREATE TRIGGER games_set_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Auto-update updated_at whenever a user changes their pick.
CREATE TRIGGER picks_set_updated_at
  BEFORE UPDATE ON picks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- PHASE 4: ROW LEVEL SECURITY (RLS)
-- Enable RLS on every table, then define exactly who can do what.
-- RLS means: by default, no one can access any row. Policies below
-- open up specific access for specific roles.
-- ============================================================

ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE games        ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log    ENABLE ROW LEVEL SECURITY;


-- ----------------------------------------------------------
-- RLS: profiles
-- ----------------------------------------------------------

-- Any logged-in user can read any profile.
-- Usernames must be public so they appear on leaderboards and in groups.
CREATE POLICY "profiles: authenticated users can read all"
  ON profiles FOR SELECT TO authenticated
  USING (true);

-- Users can only create their own profile row.
-- The trigger in Phase 3 handles this automatically on signup.
CREATE POLICY "profiles: users can insert own"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Users can only edit their own profile (username, display name, avatar, email opt-in).
CREATE POLICY "profiles: users can update own"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());


-- ----------------------------------------------------------
-- RLS: sports
-- ----------------------------------------------------------

CREATE POLICY "sports: authenticated users can read"
  ON sports FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "sports: admins can insert"
  ON sports FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "sports: admins can update"
  ON sports FOR UPDATE TO authenticated
  USING (is_admin());

CREATE POLICY "sports: admins can delete"
  ON sports FOR DELETE TO authenticated
  USING (is_admin());


-- ----------------------------------------------------------
-- RLS: seasons
-- ----------------------------------------------------------

CREATE POLICY "seasons: authenticated users can read"
  ON seasons FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "seasons: admins can insert"
  ON seasons FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "seasons: admins can update"
  ON seasons FOR UPDATE TO authenticated
  USING (is_admin());

CREATE POLICY "seasons: admins can delete"
  ON seasons FOR DELETE TO authenticated
  USING (is_admin());


-- ----------------------------------------------------------
-- RLS: weeks
-- ----------------------------------------------------------

CREATE POLICY "weeks: authenticated users can read"
  ON weeks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "weeks: admins can insert"
  ON weeks FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "weeks: admins can update"
  ON weeks FOR UPDATE TO authenticated
  USING (is_admin());

CREATE POLICY "weeks: admins can delete"
  ON weeks FOR DELETE TO authenticated
  USING (is_admin());


-- ----------------------------------------------------------
-- RLS: games
-- ----------------------------------------------------------

CREATE POLICY "games: authenticated users can read"
  ON games FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "games: admins can insert"
  ON games FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "games: admins can update"
  ON games FOR UPDATE TO authenticated
  USING (is_admin());

CREATE POLICY "games: admins can delete"
  ON games FOR DELETE TO authenticated
  USING (is_admin());


-- ----------------------------------------------------------
-- RLS: picks
-- Three read rules, one per scenario:
--   1. Users always see their own picks.
--   2. Users see others' picks only after that game has kicked off.
--   3. Admins see all picks at any time (needed for scoring).
-- ----------------------------------------------------------

-- Users always see their own picks.
CREATE POLICY "picks: users can read own"
  ON picks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can see other people's picks only after that game's kickoff time.
-- This prevents anyone from watching others pick before submitting their own.
CREATE POLICY "picks: users can read others after kickoff"
  ON picks FOR SELECT TO authenticated
  USING (
    user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM games
      WHERE games.id = picks.game_id
        AND games.kickoff_at <= now()
    )
  );

-- Admins can read all picks at any time (for scoring and the admin panel).
CREATE POLICY "picks: admins can read all"
  ON picks FOR SELECT TO authenticated
  USING (is_admin());

-- Users can only submit picks under their own user ID.
CREATE POLICY "picks: users can insert own"
  ON picks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own picks (before lock — enforced in app code).
CREATE POLICY "picks: users can update own"
  ON picks FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Users can withdraw (delete) their own pick before the game locks.
CREATE POLICY "picks: users can delete own"
  ON picks FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Admins can update any pick (to fill in points_earned after scoring).
CREATE POLICY "picks: admins can update all"
  ON picks FOR UPDATE TO authenticated
  USING (is_admin());


-- ----------------------------------------------------------
-- RLS: groups
-- ----------------------------------------------------------

-- All logged-in users can read groups (needed to look up a group by join code).
CREATE POLICY "groups: authenticated users can read"
  ON groups FOR SELECT TO authenticated
  USING (true);

-- Any logged-in user can create a group; they must be the listed creator.
CREATE POLICY "groups: users can create own"
  ON groups FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Group creators and admins can edit group details.
CREATE POLICY "groups: owner or admin can update"
  ON groups FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR is_admin());

-- Only admins can hard-delete groups (owners use is_active = false).
CREATE POLICY "groups: admins can delete"
  ON groups FOR DELETE TO authenticated
  USING (is_admin());


-- ----------------------------------------------------------
-- RLS: group_members
-- ----------------------------------------------------------

-- Members of a group can see who else is in that group.
-- Users can also always see their own membership rows.
CREATE POLICY "group_members: members can read"
  ON group_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
    )
  );

-- Users can add themselves to a group (after the app validates the join code).
CREATE POLICY "group_members: users can join"
  ON group_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Group owners and admins can promote or demote member roles.
CREATE POLICY "group_members: owner or admin can update"
  ON group_members FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'owner'
    )
  );

-- Users can leave a group themselves.
-- Group owners can remove any member.
-- Admins can remove anyone from any group.
CREATE POLICY "group_members: owner can remove or user can leave"
  ON group_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'owner'
    )
  );


-- ----------------------------------------------------------
-- RLS: email_log
-- Only admins can view or write email send history.
-- "FOR ALL" covers SELECT, INSERT, UPDATE, and DELETE in one rule.
-- ----------------------------------------------------------
CREATE POLICY "email_log: admins only"
  ON email_log FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());


-- ============================================================
-- END OF MIGRATION
-- ============================================================
-- Phase 1 — 9 tables created (profiles, sports, seasons, weeks,
--            games, picks, groups, group_members, email_log)
-- Phase 2 — 3 functions created (set_updated_at, handle_new_user,
--            is_admin)
-- Phase 3 — 3 triggers created (on_auth_user_created,
--            games_set_updated_at, picks_set_updated_at)
-- Phase 4 — RLS enabled on all 9 tables; 28 policies created
-- ============================================================
