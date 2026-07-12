-- Race-proof duplicate guard: enforce one player identity (phone + name + DOB)
-- per tournament at the database level. This is the last line of defense behind
-- the app-level checks and closes the tiny concurrent-submit (TOCTOU) window.

-- 1. Denormalize tournament_id onto players so uniqueness can be scoped per
--    tournament (the same person may register in different tournaments).
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;

-- 2. Backfill existing rows from their registration.
UPDATE players p
SET tournament_id = r.tournament_id
FROM registrations r
WHERE r.id = p.registration_id
  AND p.tournament_id IS NULL;

-- 3. Keep tournament_id populated automatically on insert/update, so the unique
--    index is always effective regardless of the calling code.
CREATE OR REPLACE FUNCTION set_player_tournament_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tournament_id IS NULL AND NEW.registration_id IS NOT NULL THEN
    SELECT tournament_id INTO NEW.tournament_id
    FROM registrations
    WHERE id = NEW.registration_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_player_tournament_id ON players;
CREATE TRIGGER trg_set_player_tournament_id
  BEFORE INSERT OR UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION set_player_tournament_id();

-- 4. Partial unique index: only enforced when the full identity is present.
--    Normalization mirrors the app (trim phone/dob, trim + lowercase name).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_player_identity_per_tournament
  ON players (tournament_id, btrim(phone), lower(btrim(name)), btrim(dob))
  WHERE tournament_id IS NOT NULL
    AND phone IS NOT NULL AND btrim(phone) <> ''
    AND name IS NOT NULL AND btrim(name) <> ''
    AND dob IS NOT NULL AND btrim(dob) <> '';
