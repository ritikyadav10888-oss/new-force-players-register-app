-- Per team-sport team assignment (Option B): map sport entry id → precreated team id.
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS teams_by_sport JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN registrations.teams_by_sport IS
  'Map of sport entry id → precreated team id when multiple team sports are selected.';
