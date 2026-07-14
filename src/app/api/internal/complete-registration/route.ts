import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import {
  createRegistrationFromPayload,
  type RegistrationPayload,
} from '@/lib/registrations/create';

/**
 * Called by the razorpay-webhook Edge Function after marking an order `paid`.
 * Loads any pending registration payload and completes the registration.
 * Auth: shared secret header `x-internal-secret` == INTERNAL_COMPLETE_SECRET.
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.INTERNAL_COMPLETE_SECRET;
    if (!secret) {
      console.error('INTERNAL_COMPLETE_SECRET is not configured');
      return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
    }

    const provided = request.headers.get('x-internal-secret') || '';
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      razorpayOrderId?: unknown;
      razorpayPaymentId?: unknown;
    };
    const razorpayOrderId =
      typeof body.razorpayOrderId === 'string' ? body.razorpayOrderId.trim() : '';
    const razorpayPaymentId =
      typeof body.razorpayPaymentId === 'string' ? body.razorpayPaymentId.trim() : null;

    if (!razorpayOrderId) {
      return NextResponse.json({ error: 'razorpayOrderId required' }, { status: 400 });
    }

    const db = getServiceSupabase();

    const { data: order, error: orderErr } = await db
      .from('payment_orders')
      .select('id, razorpay_order_id, razorpay_payment_id, tournament_id, status, registration_id')
      .eq('razorpay_order_id', razorpayOrderId)
      .maybeSingle();

    if (orderErr) throw orderErr;
    if (!order) {
      return NextResponse.json({ error: 'Order not found', skipped: true }, { status: 404 });
    }
    if (order.registration_id || order.status === 'consumed') {
      // Client already finished — delete any leftover pending and quit.
      await db.from('pending_registrations').delete().eq('razorpay_order_id', razorpayOrderId);
      return NextResponse.json({ ok: true, alreadyConsumed: true });
    }

    const { data: pending, error: pendingErr } = await db
      .from('pending_registrations')
      .select('payload, tournament_id')
      .eq('razorpay_order_id', razorpayOrderId)
      .maybeSingle();

    if (pendingErr) throw pendingErr;
    if (!pending?.payload) {
      // No saved form — stays as orphan for admin panel. Not an error.
      return NextResponse.json({ ok: true, noPending: true });
    }

    const payload = {
      ...(pending.payload as RegistrationPayload),
      tournamentId: order.tournament_id,
    };

    const paymentId = razorpayPaymentId || order.razorpay_payment_id;

    const result = await createRegistrationFromPayload(db, payload, {
      paymentStatus: 'Paid',
      razorpayOrderId: order.razorpay_order_id,
      razorpayPaymentId: paymentId,
      paymentOrder: { id: order.id },
    });

    if (!result.ok) {
      // Leave pending + paid order for admin/manual recovery.
      console.error('Auto-complete registration failed:', result.error);
      return NextResponse.json(
        { error: result.error, duplicate: result.duplicate === true },
        { status: result.status }
      );
    }

    await db.from('pending_registrations').delete().eq('razorpay_order_id', razorpayOrderId);

    return NextResponse.json({
      ok: true,
      registrationId: (result.registration as { id?: string }).id ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal complete failed';
    console.error('internal/complete-registration:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
