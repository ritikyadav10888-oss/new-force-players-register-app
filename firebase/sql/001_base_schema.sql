-- Cloud SQL Postgres bootstrap for Firebase project force-pulse-fa138
-- Run after creating the Cloud SQL instance + database (e.g. force_pulse).
-- NEW empty database only. For data migration, dump from Supabase then restore here.
--
-- Enable UUID helper (Cloud SQL Postgres):
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tournaments
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  is_public BOOLEAN NOT NULL DEFAULT true,
  custom_fields JSONB DEFAULT '[]'::jsonb,
  form_config JSONB DEFAULT '{}'::jsonb,
  banner_url TEXT,
  sponsors JSONB NOT NULL DEFAULT '[]'::jsonb,
  sport TEXT NOT NULL DEFAULT 'Cricket',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Registrations
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Players
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- 4. Admin allow-list (Firebase Auth UIDs after Auth cutover)
CREATE TABLE IF NOT EXISTS admin_users (
  user_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Apply remaining incremental SQL from supabase/migrations/* after this base,
-- adapting uuid_generate_v4() → gen_random_uuid() if needed.
