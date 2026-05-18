-- Public vs private listing: only is_public tournaments appear on anon/public reads (e.g. direct Supabase from browser with anon key).
-- Registration by slug still works via service-role API regardless of is_public.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN tournaments.is_public IS 'When false, tournament is hidden from the public homepage listing; direct /register/[slug] still works.';

DROP POLICY IF EXISTS "Public read active tournaments" ON tournaments;
CREATE POLICY "Public read active tournaments"
  ON tournaments FOR SELECT
  TO anon
  USING (status = 'Active' AND is_public = true);
