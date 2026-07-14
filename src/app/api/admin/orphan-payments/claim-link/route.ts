import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getServiceSupabase } from '@/lib/supabase/service';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';

const CLAIM_TTL_DAYS = 14;

/** Generate (or refresh) a shareable claim link for an orphan payment. */
export async function PUT(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const body = (await request.json()) as { orderId?: unknown };
    const orderId = typeof body.orderId === 'string' ? body.orderId : '';
    if (!orderId) {
      return NextResponse.json({ error: 'Missing payment order id.' }, { status: 400 });
    }

    const db = getServiceSupabase();
    const { data: order, error: orderErr } = await db
      .from('payment_orders')
      .select(
        'id, razorpay_order_id, razorpay_payment_id, tournament_id, status, registration_id, resolved_at, claim_token, claim_expires_at'
      )
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr) throw orderErr;
    if (!order) {
      return NextResponse.json({ error: 'Payment order not found.' }, { status: 404 });
    }
    if (order.registration_id) {
      return NextResponse.json(
        { error: 'This payment is already linked to a registration.' },
        { status: 409 }
      );
    }
    if (order.status !== 'paid') {
      return NextResponse.json(
        { error: `This payment order is "${order.status}", not "paid".` },
        { status: 400 }
      );
    }
    if (order.resolved_at) {
      return NextResponse.json(
        { error: 'This payment was marked resolved (e.g. refunded).' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const existingValid =
      typeof order.claim_token === 'string' &&
      order.claim_token.length > 0 &&
      order.claim_expires_at &&
      new Date(order.claim_expires_at).getTime() > now;

    const token = existingValid ? (order.claim_token as string) : randomBytes(24).toString('hex');
    const expiresAt = new Date(now + CLAIM_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    if (!existingValid) {
      const { error: updateErr } = await db
        .from('payment_orders')
        .update({ claim_token: token, claim_expires_at: expiresAt })
        .eq('id', orderId);
      if (updateErr) throw updateErr;
    } else if (!order.claim_expires_at || new Date(order.claim_expires_at).getTime() < now + 24 * 60 * 60 * 1000) {
      // Refresh expiry if less than a day left
      const { error: updateErr } = await db
        .from('payment_orders')
        .update({ claim_expires_at: expiresAt })
        .eq('id', orderId);
      if (updateErr) throw updateErr;
    }

    const origin = new URL(request.url).origin;
    const claimPath = `/claim/${token}`;
    const claimUrl = `${origin}${claimPath}`;

    return NextResponse.json({
      ok: true,
      token,
      claimPath,
      claimUrl,
      expiresAt: existingValid && order.claim_expires_at
        ? (new Date(order.claim_expires_at).getTime() < now + 24 * 60 * 60 * 1000
            ? expiresAt
            : order.claim_expires_at)
        : expiresAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create claim link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
