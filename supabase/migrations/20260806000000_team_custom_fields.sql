-- Admin-defined custom fields about the TEAM itself (not per-player),
-- answered once per team invite (self-serve start flow or admin-created link).

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS team_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE team_invites
  ADD COLUMN IF NOT EXISTS team_custom_values JSONB NOT NULL DEFAULT '{}'::jsonb;
