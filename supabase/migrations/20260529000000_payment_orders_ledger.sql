-- Payment security hardening (Critical 1: payment replay / fee mismatch)
--
-- Adds a server-side payment ledger so a Razorpay payment can only be used:
--   * for the tournament it was created for
--   * for the exact fee amount
--   * exactly once (no replay across registrations)
--
-- Safe to run on existing databases (idempotent).

-- ---------------------------------------------------------------------------
-- 1. Payment order ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_order_id TEXT NOT NULL UNIQUE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  amount_paise BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created', -- created | consumed
  razorpay_payment_id TEXT,
  registration_id UUID REFERENCES registrations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS payment_orders_tournament_id_idx
  ON payment_orders (tournament_id);

-- Only the service-role API touches this table; lock out anon/authenticated.
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Enforce single-use payment IDs at the database level (replay safety net)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS registrations_razorpay_payment_id_unique
  ON registrations (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
