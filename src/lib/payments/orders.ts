import { query } from '@/lib/db/pool';

export type PaymentOrderRow = {
  id: string;
  razorpay_order_id: string;
  tournament_id: string;
  amount_paise: number;
  currency: string;
  status: string;
  razorpay_payment_id: string | null;
};

export type PaymentOrderValidation =
  | { ok: true; order: PaymentOrderRow }
  | { ok: false; status: number; error: string };

function formatOrderError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

/** Persist a Razorpay order. Idempotent on razorpay_order_id. */
export async function recordPaymentOrder(params: {
  razorpayOrderId: string;
  tournamentId: string;
  amountPaise: number;
  currency?: string;
  teamInviteId?: string | null;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO payment_orders (
         razorpay_order_id, tournament_id, amount_paise, currency, status, team_invite_id
       ) VALUES ($1, $2, $3, $4, 'created', $5)
       ON CONFLICT (razorpay_order_id) DO NOTHING`,
      [
        params.razorpayOrderId,
        params.tournamentId,
        params.amountPaise,
        params.currency || 'INR',
        params.teamInviteId || null,
      ]
    );
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === '23505') return;
    throw new Error(formatOrderError(error, 'Failed to record payment order'));
  }
}

export async function validatePaymentOrder(params: {
  razorpayOrderId: string;
  tournamentId: string;
  expectedAmountPaise: number;
}): Promise<PaymentOrderValidation> {
  try {
    const { rows } = await query<PaymentOrderRow>(
      `SELECT id, razorpay_order_id, tournament_id, amount_paise, currency, status, razorpay_payment_id
       FROM payment_orders
       WHERE razorpay_order_id = $1
       LIMIT 1`,
      [params.razorpayOrderId]
    );
    const order = rows[0];
    if (!order) {
      return {
        ok: false,
        status: 402,
        error: 'Payment could not be verified for this tournament.',
      };
    }
    if (order.tournament_id !== params.tournamentId) {
      return {
        ok: false,
        status: 402,
        error: 'This payment was not made for this tournament.',
      };
    }
    if (Number(order.amount_paise) !== params.expectedAmountPaise) {
      return {
        ok: false,
        status: 402,
        error: 'Paid amount does not match the registration fee.',
      };
    }
    if (order.status === 'consumed') {
      return {
        ok: false,
        status: 409,
        error: 'This payment has already been used to register.',
      };
    }
    return { ok: true, order };
  } catch {
    return { ok: false, status: 500, error: 'Could not verify the payment order.' };
  }
}

export async function consumePaymentOrder(params: {
  id: string;
  razorpayPaymentId: string | null;
  registrationId: string;
}): Promise<void> {
  await query(
    `UPDATE payment_orders
     SET status = 'consumed',
         razorpay_payment_id = $2,
         registration_id = $3,
         consumed_at = NOW()
     WHERE id = $1`,
    [params.id, params.razorpayPaymentId, params.registrationId]
  );
}
