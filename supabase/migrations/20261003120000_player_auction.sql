-- Player auction: admin-defined team names per tournament, and which team bought each player for how much.
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS auction_teams JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS auction_team TEXT,
  ADD COLUMN IF NOT EXISTS auction_price INTEGER;
