-- Firebase Auth UIDs are strings (e.g. zTWHRDFWOWXJXpWPs1HTBHNTv4w1), not UUIDs.
-- Align tournaments.owner_id with admin_users.user_id (TEXT).
ALTER TABLE tournaments
  ALTER COLUMN owner_id TYPE TEXT USING owner_id::text;
