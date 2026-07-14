-- Shareable claim links for orphan payments: admin copies a link, the player
-- fills the registration form themselves, and submission attaches to the paid order.

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS claim_token TEXT,
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_claim_token_uidx
  ON payment_orders (claim_token)
  WHERE claim_token IS NOT NULL;
