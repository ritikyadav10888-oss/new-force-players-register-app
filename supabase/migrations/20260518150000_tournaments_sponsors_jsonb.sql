-- Multiple sponsors (JSON array of strings). Migrates legacy sponsor_name when that column exists.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS sponsors JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tournaments'
      AND column_name = 'sponsor_name'
  ) THEN
    UPDATE tournaments
    SET sponsors = jsonb_build_array(trim(sponsor_name::text))
    WHERE sponsor_name IS NOT NULL
      AND trim(sponsor_name::text) <> ''
      AND sponsors = '[]'::jsonb;

    ALTER TABLE tournaments DROP COLUMN sponsor_name;
  END IF;
END $$;

COMMENT ON COLUMN tournaments.sponsors IS 'JSON array of sponsors: strings or {"name","logo"} objects. Shown on registration banner and form.';
