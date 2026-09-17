-- Full public schema for Cloud SQL (Firebase project force-pulse-fa138)
-- Derived from supabase_schema.sql + supabase/migrations/*
-- No Supabase Auth / Storage / RLS (app uses server credentials on Vercel).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  venue TEXT,
  fee INTEGER DEFAULT 0,
  min_players INTEGER NOT NULL DEFAULT 1,
  max_players INTEGER DEFAULT 1,
  theme TEXT DEFAULT '#6366f1',
  description TEXT,
  registration_deadline TEXT,
  rules TEXT,
  organizer_name TEXT,
  organizer_phone TEXT,
  terms TEXT,
  status TEXT DEFAULT 'Active',
  is_public BOOLEAN NOT NULL DEFAULT true,
  custom_fields JSONB DEFAULT '[]'::jsonb,
  team_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  form_config JSONB DEFAULT '{}'::jsonb,
  banner_url TEXT,
  sponsors JSONB NOT NULL DEFAULT '[]'::jsonb,
  sport TEXT NOT NULL DEFAULT 'Cricket',
  sports_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  precreated_teams JSONB NOT NULL DEFAULT '[]'::jsonb,
  age_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  team_name TEXT,
  representative TEXT,
  contact TEXT,
  payment_status TEXT DEFAULT 'Pending',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  team_logo_url TEXT,
  selected_sports JSONB NOT NULL DEFAULT '[]'::jsonb,
  fee_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  precreated_team_id TEXT,
  teams_by_sport JSONB NOT NULL DEFAULT '{}'::jsonb,
  team_custom_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS registrations_razorpay_payment_id_unique
  ON registrations (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  emergency_contact TEXT,
  dob TEXT,
  age TEXT,
  age_category TEXT,
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
  sport_profiles JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_values JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE UNIQUE INDEX IF NOT EXISTS uniq_player_identity_per_tournament
  ON players (tournament_id, btrim(phone), lower(btrim(name)), btrim(dob))
  WHERE tournament_id IS NOT NULL
    AND phone IS NOT NULL AND btrim(phone) <> ''
    AND name IS NOT NULL AND btrim(name) <> ''
    AND dob IS NOT NULL AND btrim(dob) <> '';

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  organizer TEXT,
  sport TEXT,
  expected_teams TEXT,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Firebase Auth UIDs are strings; keep TEXT (legacy Supabase UUIDs still fit).
CREATE TABLE IF NOT EXISTS admin_users (
  user_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_order_id TEXT NOT NULL UNIQUE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  amount_paise BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created',
  razorpay_payment_id TEXT,
  registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
  team_invite_id UUID,
  paid_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  claim_token TEXT,
  claim_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS payment_orders_tournament_id_idx ON payment_orders (tournament_id);
CREATE INDEX IF NOT EXISTS payment_orders_status_idx ON payment_orders (status);
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_claim_token_uidx
  ON payment_orders (claim_token)
  WHERE claim_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS pending_registrations (
  razorpay_order_id TEXT PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  team_name TEXT NOT NULL,
  representative TEXT NOT NULL,
  contact TEXT NOT NULL,
  team_logo_url TEXT,
  min_players INT NOT NULL DEFAULT 1,
  max_players INT NOT NULL DEFAULT 11,
  selected_sports JSONB NOT NULL DEFAULT '[]'::jsonb,
  teams_by_sport JSONB NOT NULL DEFAULT '{}'::jsonb,
  fee_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  team_custom_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_age_category_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'Pending',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_invites_tournament_id_idx ON team_invites(tournament_id);
CREATE INDEX IF NOT EXISTS team_invites_token_idx ON team_invites(token);

CREATE TABLE IF NOT EXISTS team_invite_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_invite_id UUID NOT NULL REFERENCES team_invites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  emergency_contact TEXT,
  dob TEXT,
  age TEXT,
  age_category TEXT,
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
  sport_profiles JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_invite_players_invite_id_idx ON team_invite_players(team_invite_id);

ALTER TABLE payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_team_invite_id_fkey;
ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_team_invite_id_fkey
  FOREIGN KEY (team_invite_id) REFERENCES team_invites(id) ON DELETE SET NULL;

CREATE UNLOGGED TABLE IF NOT EXISTS rate_limits (
  bucket_key   TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_max INT,
  p_window_seconds INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ :=
    to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_count INT;
BEGIN
  INSERT INTO rate_limits(bucket_key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

CREATE OR REPLACE VIEW orphaned_payments AS
SELECT
  po.id,
  po.razorpay_order_id,
  po.razorpay_payment_id,
  po.tournament_id,
  t.name AS tournament_name,
  po.amount_paise,
  po.currency,
  po.paid_at,
  po.created_at,
  (pr.razorpay_order_id IS NOT NULL) AS has_pending_payload,
  po.team_invite_id,
  ti.team_name AS team_invite_team_name
FROM payment_orders po
LEFT JOIN tournaments t ON t.id = po.tournament_id
LEFT JOIN pending_registrations pr ON pr.razorpay_order_id = po.razorpay_order_id
LEFT JOIN team_invites ti ON ti.id = po.team_invite_id
WHERE po.status = 'paid'
  AND po.registration_id IS NULL
  AND po.resolved_at IS NULL
  AND po.paid_at < now() - interval '15 minutes'
ORDER BY po.paid_at DESC;
