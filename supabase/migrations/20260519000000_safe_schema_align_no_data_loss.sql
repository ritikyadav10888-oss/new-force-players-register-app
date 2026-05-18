-- Safe schema alignment (existing production DB — no DROP TABLE, no data loss)
-- Run once in Supabase SQL Editor after your base tables already exist.
-- Then: INSERT INTO admin_users (user_id) VALUES ('your-auth-uuid');

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. Core tables (only created if missing — never overwrites existing data)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  venue TEXT,
  fee INTEGER DEFAULT 0,
  max_players INTEGER DEFAULT 1,
  theme TEXT DEFAULT '#6366f1',
  description TEXT,
  registration_deadline TEXT,
  rules TEXT,
  organizer_name TEXT,
  organizer_phone TEXT,
  terms TEXT,
  status TEXT DEFAULT 'Active',
  custom_fields JSONB DEFAULT '[]'::jsonb,
  form_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  team_name TEXT,
  representative TEXT,
  contact TEXT,
  payment_status TEXT DEFAULT 'Pending',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  emergency_contact TEXT,
  dob TEXT,
  age TEXT,
  gender TEXT,
  aadhar TEXT,
  jersey_name TEXT,
  jersey_number TEXT,
  jersey_size TEXT,
  photo_url TEXT,
  role TEXT,
  batting_hand TEXT,
  bowling_type TEXT,
  all_rounder_type TEXT,
  custom_values JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  organizer TEXT,
  sport TEXT,
  expected_teams TEXT,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Add missing columns only (existing rows keep their data)
-- ---------------------------------------------------------------------------

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS sponsors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS sport TEXT DEFAULT 'Cricket';

UPDATE tournaments SET is_public = true WHERE is_public IS NULL;
UPDATE tournaments SET sponsors = '[]'::jsonb WHERE sponsors IS NULL;
UPDATE tournaments SET sport = 'Cricket' WHERE sport IS NULL OR trim(sport) = '';

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS team_logo_url TEXT;

-- ---------------------------------------------------------------------------
-- 3. Storage bucket (safe if already exists)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Admin + RLS (required for production admin dashboard)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read own row" ON admin_users;
CREATE POLICY "Admins read own row"
  ON admin_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
$$;

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;

DROP POLICY IF EXISTS "Public read active tournaments" ON tournaments;
CREATE POLICY "Public read active tournaments"
  ON tournaments FOR SELECT
  TO anon
  USING (status = 'Active' AND is_public = true);

DROP POLICY IF EXISTS "Admins read all tournaments" ON tournaments;
CREATE POLICY "Admins read all tournaments"
  ON tournaments FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert tournaments" ON tournaments;
CREATE POLICY "Admins insert tournaments"
  ON tournaments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update tournaments" ON tournaments;
CREATE POLICY "Admins update tournaments"
  ON tournaments FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete tournaments" ON tournaments;
CREATE POLICY "Admins delete tournaments"
  ON tournaments FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins read registrations" ON registrations;
CREATE POLICY "Admins read registrations"
  ON registrations FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins read players" ON players;
CREATE POLICY "Admins read players"
  ON players FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Public insert inquiries" ON contact_inquiries;
CREATE POLICY "Public insert inquiries"
  ON contact_inquiries FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins read inquiries" ON contact_inquiries;
CREATE POLICY "Admins read inquiries"
  ON contact_inquiries FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins delete inquiries" ON contact_inquiries;
CREATE POLICY "Admins delete inquiries"
  ON contact_inquiries FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Grant admin (replace UUID after run):
-- INSERT INTO admin_users (user_id) VALUES ('your-auth-user-uuid') ON CONFLICT DO NOTHING;
