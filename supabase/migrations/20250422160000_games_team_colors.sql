-- Team primary colors from ESPN (hex, no #) for picks UI gradients.
-- Populated on admin save (ESPN lookup) and on score refresh.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS home_team_color TEXT,
  ADD COLUMN IF NOT EXISTS away_team_color TEXT;
