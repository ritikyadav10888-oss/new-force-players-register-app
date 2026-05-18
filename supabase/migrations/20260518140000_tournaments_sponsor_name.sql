-- Optional sponsors (JSON array) for the registration banner. Prefer this over legacy single-column migrations.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS sponsors JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tournaments.sponsors IS 'JSON array of sponsor names. Shown on registration banner.';
