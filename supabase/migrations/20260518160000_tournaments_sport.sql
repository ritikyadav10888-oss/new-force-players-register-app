-- Sport for tournament-specific registration (e.g. Cricket → role / batting / bowling UI).

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'Cricket';

COMMENT ON COLUMN tournaments.sport IS 'Cricket, Football, or Other — drives sport-specific player fields on registration.';
