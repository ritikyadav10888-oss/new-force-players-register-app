import Razorpay from 'razorpay';

export type GatewayVerification =
  | { ok: true; skipped?: boolean; warning?: string }
  | { ok: false; error: string };

/**
 * Authoritative check against Razorpay: confirm the payment belongs to the
 * order and matches the expected amount.
 *
 * - Definitive mismatch (wrong order / wrong amount / refunded/failed) -> deny.
 * - Keys missing (dev/mock) -> skip (signature + ledger already gate this).
 * - Transient gateway/network error -> allow with a warning, because the
 *   HMAC signature + payment-order ledger have already verified authenticity.
 */
export async function verifyRazorpayPaymentWithGateway(params: {
  orderId: string;
  paymentId: string;
  expectedAmountPaise: number;
}): Promise<GatewayVerification> {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  // No live keys (dev / mock mode) — nothing authoritative to fetch.
  if (!keyId || !keySecret) {
    return { ok: true, skipped: true };
  }
  // Mock order ids never exist on Razorpay.
  if (params.orderId.startsWith('order_mock_')) {
    return { ok: true, skipped: true };
  }

  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const payment = await razorpay.payments.fetch(params.paymentId);

    if (payment.order_id !== params.orderId) {
      return { ok: false, error: 'Payment does not belong to this order.' };
    }
    if (Number(payment.amount) !== params.expectedAmountPaise) {
      return { ok: false, error: 'Paid amount does not match the registration fee.' };
    }

    const status = String(payment.status);
    // captured/authorized = money secured; reject failed/refunded states.
    if (status !== 'captured' && status !== 'authorized') {
      return { ok: false, error: `Payment is not completed (status: ${status}).` };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gateway verification error';
    // Fail-open on transient errors; signature + ledger already verified.
    return { ok: true, warning: message };
  }
}
