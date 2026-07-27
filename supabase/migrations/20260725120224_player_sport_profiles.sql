-- Per-sport cricket/football profile JSON on each player.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS sport_profiles JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN players.sport_profiles IS
  'Per-sport profiles: { cricket?: { role, battingHand, bowlingType, allRounderType }, football?: { role } }.';
