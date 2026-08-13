-- Links a payment order back to the team invite it was created for, so the
-- Razorpay webhook's auto-complete path (previously only handled individual
-- registrations via pending_registrations) can also recover a team invite
-- whose payment succeeded but whose browser never returned to confirm it.
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS team_invite_id UUID;
