-- Multi-sport events: optional sports list with per-entry fee/type,
-- admin-precreated team slots, and selected sports on each registration.
-- Backward compatible: empty sports_config = legacy single sport/fee/type.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS sports_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS precreated_teams JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tournaments.sports_config IS
  'Array of { id, name, entryType: individual|doubles|team, fee, minPlayers, maxPlayers }. Empty = legacy single-sport mode.';

COMMENT ON COLUMN tournaments.precreated_teams IS
  'Array of { id, name }. Admin-created team slots for team sports; players pick one at registration.';

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS selected_sports JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fee_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS precreated_team_id TEXT;

COMMENT ON COLUMN registrations.selected_sports IS
  'Array of sport entry ids chosen at registration (from tournaments.sports_config).';

COMMENT ON COLUMN registrations.fee_breakdown IS
  'Array of { sportId, name, fee } for the paid total.';

COMMENT ON COLUMN registrations.precreated_team_id IS
  'Id of admin-precreated team slot when a team sport was selected.';
