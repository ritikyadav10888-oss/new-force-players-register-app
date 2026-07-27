-- Admin-defined age categories on tournaments; store resolved category on each player.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS age_categories JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tournaments.age_categories IS
  'Array of { id, name, minAge, maxAge }. Empty = use app legacy Kids/Teens/Men bands.';

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS age_category TEXT;

COMMENT ON COLUMN players.age_category IS
  'Resolved age category name at registration (from tournament age_categories or legacy).';
