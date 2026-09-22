-- owner_id for customer-owned tournaments (Firebase Auth UIDs are TEXT, not UUID)
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS owner_id TEXT;
CREATE INDEX IF NOT EXISTS tournaments_owner_id_idx ON tournaments (owner_id);
