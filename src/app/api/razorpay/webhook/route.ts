import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { query } from '@/lib/db/pool';

/**
 * Razorpay webhook (replaces supabase/functions/razorpay-webhook).
 * Point Razorpay Dashboard → Webhooks to:
 *   https://forcepulsev1.vercel.app/api/razorpay/webhook
 * Secret: RAZORPAY_WEBHOOK_SECRET (same value in Vercel Production env)
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('RAZORPAY_WEBHOOK_SECRET is not configured');
    return new Response('Server not configured', { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  try {
    const ok =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!ok) return new Response('Invalid signature', { status: 401 });
  } catch {
    return new Response('Invalid signature', { status: 401 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { order_id?: string; id?: string } } };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  try {
    if (event?.event === 'payment.captured') {
      const payment = event?.payload?.payment?.entity ?? {};
      const orderId = payment.order_id;
      const paymentId = payment.id ?? null;

      if (orderId) {
        try {
          await query(
            `UPDATE payment_orders
             SET status = 'paid',
                 razorpay_payment_id = COALESCE($2, razorpay_payment_id),
                 paid_at = COALESCE(paid_at, now())
             WHERE razorpay_order_id = $1 AND status = 'created'`,
            [orderId, paymentId]
          );
        } catch (dbErr: unknown) {
          const message = dbErr instanceof Error ? dbErr.message : String(dbErr);
          console.error('Failed to mark payment order paid:', message);
          return new Response('DB update failed', { status: 500 });
        }

        try {
          const { completePaidOrder } = await import('@/lib/payments/complete-paid-order');
          const result = await completePaidOrder(orderId, paymentId);
          if (!result.ok && !result.skipped) {
            console.error('completePaidOrder failed:', result.error);
          }
        } catch (completeErr) {
          console.error('completePaidOrder call failed:', completeErr);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('razorpay-webhook error:', err);
    return new Response('Internal error', { status: 500 });
  }
}
