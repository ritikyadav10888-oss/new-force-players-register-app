-- Discipline labels the player picked (Track, Field, Relay, Fun Games).
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS selected_disciplines JSONB NOT NULL DEFAULT '[]'::jsonb;
