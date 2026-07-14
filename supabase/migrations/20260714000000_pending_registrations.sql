-- Resilient registration flow: store the full registration payload BEFORE
-- payment so a captured payment can always be turned into a registration, even
-- if the client never calls /api/register (closed tab, mobile UPI return, etc.).
--
-- Also adds resolution bookkeeping to payment_orders so handled orphans (manual
-- registration or refund) drop off the orphaned_payments view.

CREATE TABLE IF NOT EXISTS pending_registrations (
  razorpay_order_id TEXT PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Service-role only: no policies means anon/authenticated cannot read the
-- payload (which contains personal data + base64 photos). The service role key
-- bypasses RLS for our server routes.
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;

-- Orphan view: paid, never turned into a registration, older than 15 minutes,
-- and not yet resolved by an admin.
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
  (pr.razorpay_order_id IS NOT NULL) AS has_pending_payload
FROM payment_orders po
LEFT JOIN tournaments t ON t.id = po.tournament_id
LEFT JOIN pending_registrations pr ON pr.razorpay_order_id = po.razorpay_order_id
WHERE po.status = 'paid'
  AND po.registration_id IS NULL
  AND po.resolved_at IS NULL
  AND po.paid_at < now() - interval '15 minutes'
ORDER BY po.paid_at DESC;

ALTER VIEW orphaned_payments SET (security_invoker = true);
REVOKE ALL ON orphaned_payments FROM anon, authenticated;
