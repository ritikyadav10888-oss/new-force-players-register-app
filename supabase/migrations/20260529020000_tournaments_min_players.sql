-- Minimum players per team for a tournament (pairs with existing max_players).
-- Lets organizers require, e.g., a roster of 7–10 players per team.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS min_players INTEGER NOT NULL DEFAULT 1;

UPDATE tournaments SET min_players = 1 WHERE min_players IS NULL;
