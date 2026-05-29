import type { getServiceSupabase } from '@/lib/supabase/service';

type Db = ReturnType<typeof getServiceSupabase>;

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

/**
 * Persist a Razorpay order so it can later be validated against the
 * tournament and fee it was created for. Idempotent on razorpay_order_id.
 */
export async function recordPaymentOrder(
  db: Db,
  params: {
    razorpayOrderId: string;
    tournamentId: string;
    amountPaise: number;
    currency?: string;
  }
): Promise<void> {
  const { error } = await db.from('payment_orders').insert([
    {
      razorpay_order_id: params.razorpayOrderId,
      tournament_id: params.tournamentId,
      amount_paise: params.amountPaise,
      currency: params.currency || 'INR',
      status: 'created',
    },
  ]);

  // 23505 = unique violation (order already recorded) — safe to ignore.
  if (error && error.code !== '23505') {
    throw error;
  }
}

/**
 * Ensure the order exists, belongs to this tournament, matches the fee,
 * and has not already been consumed by another registration.
 */
export async function validatePaymentOrder(
  db: Db,
  params: {
    razorpayOrderId: string;
    tournamentId: string;
    expectedAmountPaise: number;
  }
): Promise<PaymentOrderValidation> {
  const { data: order, error } = await db
    .from('payment_orders')
    .select(
      'id, razorpay_order_id, tournament_id, amount_paise, currency, status, razorpay_payment_id'
    )
    .eq('razorpay_order_id', params.razorpayOrderId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: 'Could not verify the payment order.' };
  }
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

  return { ok: true, order: order as PaymentOrderRow };
}

/** Mark an order as used and link it to the created registration. */
export async function consumePaymentOrder(
  db: Db,
  params: {
    id: string;
    razorpayPaymentId: string | null;
    registrationId: string;
  }
): Promise<void> {
  await db
    .from('payment_orders')
    .update({
      status: 'consumed',
      razorpay_payment_id: params.razorpayPaymentId,
      registration_id: params.registrationId,
      consumed_at: new Date().toISOString(),
    })
    .eq('id', params.id);
}
