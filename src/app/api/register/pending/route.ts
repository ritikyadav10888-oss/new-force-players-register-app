import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Store the registration payload BEFORE Razorpay checkout opens, keyed by
 * the Razorpay order id. If the client never returns after paying, the
 * webhook / internal complete path can still create the registration.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimited = await enforceRateLimit(request, [
      { key: `pending:ip:${ip}`, max: 30, windowSeconds: 60 },
    ]);
    if (rateLimited) return rateLimited;

    const body = (await request.json()) as {
      razorpayOrderId?: unknown;
      tournamentId?: unknown;
      payload?: unknown;
    };

    const razorpayOrderId =
      typeof body.razorpayOrderId === 'string' ? body.razorpayOrderId.trim() : '';
    const tournamentId = typeof body.tournamentId === 'string' ? body.tournamentId.trim() : '';
    if (!razorpayOrderId || !tournamentId) {
      return NextResponse.json(
        { error: 'razorpayOrderId and tournamentId are required.' },
        { status: 400 }
      );
    }
    if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      return NextResponse.json({ error: 'Registration payload is required.' }, { status: 400 });
    }

    const { rows: orders } = await query<{
      id: string;
      tournament_id: string;
      status: string;
    }>(
      `SELECT id, tournament_id, status FROM payment_orders
       WHERE razorpay_order_id = $1 LIMIT 1`,
      [razorpayOrderId]
    );
    const order = orders[0];
    if (!order) {
      return NextResponse.json({ error: 'Payment order not found.' }, { status: 404 });
    }
    if (order.tournament_id !== tournamentId) {
      return NextResponse.json({ error: 'Order does not match this tournament.' }, { status: 400 });
    }
    if (order.status === 'consumed') {
      return NextResponse.json({ error: 'This payment was already used.' }, { status: 409 });
    }

    const payload = {
      ...(body.payload as Record<string, unknown>),
      tournamentId,
    };

    await query(
      `INSERT INTO pending_registrations (razorpay_order_id, tournament_id, payload, created_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (razorpay_order_id) DO UPDATE
       SET tournament_id = EXCLUDED.tournament_id,
           payload = EXCLUDED.payload,
           created_at = NOW()`,
      [razorpayOrderId, tournamentId, JSON.stringify(payload)]
    );

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save pending registration';
    console.error('pending registration error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Optional DELETE when client finishes registration successfully. */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId')?.trim() || '';
    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }
    await query(`DELETE FROM pending_registrations WHERE razorpay_order_id = $1`, [orderId]);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clear pending registration';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
