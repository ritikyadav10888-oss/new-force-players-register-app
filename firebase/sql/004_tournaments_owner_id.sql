-- owner_id for customer-owned tournaments (was in Supabase; missing from initial Cloud SQL schema)
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS owner_id UUID;
CREATE INDEX IF NOT EXISTS tournaments_owner_id_idx ON tournaments (owner_id);
