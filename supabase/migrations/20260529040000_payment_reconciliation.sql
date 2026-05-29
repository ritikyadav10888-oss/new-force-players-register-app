-- Payment reconciliation: detect "charged but not registered" payments.
--
-- Lifecycle of payment_orders.status:
--   created  -> order created, no payment captured yet
--   paid     -> Razorpay captured the payment (set by the razorpay-webhook Edge Function)
--   consumed -> a registration was created from this payment (set by /api/register)
--
-- A payment that is `paid` but never becomes `consumed` = money taken with no
-- registration, which the orphaned_payments view surfaces for refund/admin action.

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS payment_orders_status_idx
  ON payment_orders (status);

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
  po.created_at
FROM payment_orders po
LEFT JOIN tournaments t ON t.id = po.tournament_id
WHERE po.status = 'paid'
  AND po.registration_id IS NULL
  AND po.paid_at < now() - interval '15 minutes'
ORDER BY po.paid_at DESC;

-- The view must respect the caller's RLS (payment_orders is locked to service role),
-- otherwise it would leak payment data to anon/authenticated via the API.
ALTER VIEW orphaned_payments SET (security_invoker = true);
REVOKE ALL ON orphaned_payments FROM anon, authenticated;
