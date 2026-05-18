-- Force Sports Registration Platform - Supabase Schema
-- Run this in your Supabase SQL Editor

-- 1. Tournaments Table
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'Team' or 'Individual'
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
  -- Player standard fields + sportsProfile/cricketProfile toggles (see src/lib/form-config.ts)
  form_config JSONB DEFAULT '{}'::jsonb,
  banner_url TEXT,
  sponsors JSONB NOT NULL DEFAULT '[]'::jsonb,
  sport TEXT NOT NULL DEFAULT 'Cricket', -- Cricket | Football | Other — registration UI
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Registrations Table
CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  team_name TEXT,
  representative TEXT,
  contact TEXT,
  payment_status TEXT DEFAULT 'Pending',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  team_logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Players Table
CREATE TABLE players (
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- IMPORTANT: For production, run supabase/migrations/20260516100000_production_rls.sql
-- That enables RLS, admin_users, and removes public read/write on sensitive tables.

-- ==========================================
-- 4. Supabase Storage (Buckets)
-- ==========================================
-- Run this to automatically create the storage bucket for player photos and banners
INSERT INTO storage.buckets (id, name, public) 
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to the bucket for development
CREATE POLICY "Public Access" 
ON storage.objects FOR ALL 
USING (bucket_id = 'uploads');

-- 5. Contact Inquiries Table
CREATE TABLE contact_inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  organizer TEXT,
  sport TEXT,
  expected_teams TEXT,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
