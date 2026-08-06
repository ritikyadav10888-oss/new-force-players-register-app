-- Carries the team-level custom field answers (collected once per team on a
-- team-invite link) from team_invites into the final registration record, so
-- they survive past payment completion and can appear in the Excel export.
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS team_custom_values JSONB NOT NULL DEFAULT '{}'::jsonb;
