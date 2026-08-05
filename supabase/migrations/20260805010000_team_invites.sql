-- Team invite flow: players register individually; representative pays once.

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
