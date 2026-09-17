import { NextResponse } from 'next/server';
import { completePaidOrder } from '@/lib/payments/complete-paid-order';

/**
 * Called by the razorpay webhook after marking an order `paid`.
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

    const result = await completePaidOrder(razorpayOrderId, razorpayPaymentId);
    if (!result.ok) {
      if (result.skipped) {
        return NextResponse.json(
          { error: result.error, skipped: true },
          { status: result.status }
        );
      }
      console.error('Auto-complete registration failed:', result.error);
      return NextResponse.json(
        { error: result.error, duplicate: result.duplicate === true },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal complete failed';
    console.error('internal/complete-registration:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
