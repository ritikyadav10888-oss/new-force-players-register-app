-- Production RLS for Force Sports Player Register
-- Run in Supabase SQL Editor (or: supabase db push)

-- Admin allowlist (link auth.users.id after creating admin in Dashboard)
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

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

-- Enable RLS on app tables
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;

-- Drop permissive dev policies if they exist
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

-- Tournaments: public sees Active only; admins see and manage all
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

-- Registrations & players: admin read only (writes via service role API)
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

-- Contact form: anyone can submit; admins manage
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

-- After creating a user in Authentication → Users, grant admin:
-- INSERT INTO admin_users (user_id) VALUES ('your-auth-user-uuid');
