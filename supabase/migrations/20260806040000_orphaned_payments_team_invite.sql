-- Surfaces which orphaned payments belong to a team invite (vs an individual
-- registration), now that payment_orders.team_invite_id exists and most team
-- invite orphans should self-heal via the webhook auto-complete path.
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
  (pr.razorpay_order_id IS NOT NULL) AS has_pending_payload,
  po.team_invite_id,
  ti.team_name AS team_invite_team_name
FROM payment_orders po
LEFT JOIN tournaments t ON t.id = po.tournament_id
LEFT JOIN pending_registrations pr ON pr.razorpay_order_id = po.razorpay_order_id
LEFT JOIN team_invites ti ON ti.id = po.team_invite_id
WHERE po.status = 'paid'
  AND po.registration_id IS NULL
  AND po.resolved_at IS NULL
  AND po.paid_at < now() - interval '15 minutes'
ORDER BY po.paid_at DESC;

ALTER VIEW orphaned_payments SET (security_invoker = true);
REVOKE ALL ON orphaned_payments FROM anon, authenticated;
