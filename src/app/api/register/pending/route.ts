import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
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

    const db = getServiceSupabase();

    // Ensure the order exists for this tournament (prevents random key stuffing).
    const { data: order, error: orderErr } = await db
      .from('payment_orders')
      .select('id, tournament_id, status')
      .eq('razorpay_order_id', razorpayOrderId)
      .maybeSingle();
    if (orderErr) throw orderErr;
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

    const { error } = await db.from('pending_registrations').upsert(
      {
        razorpay_order_id: razorpayOrderId,
        tournament_id: tournamentId,
        payload,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'razorpay_order_id' }
    );
    if (error) throw error;

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
    const db = getServiceSupabase();
    await db.from('pending_registrations').delete().eq('razorpay_order_id', orderId);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clear pending registration';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
