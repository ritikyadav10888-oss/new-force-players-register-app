import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getServiceSupabase } from '@/lib/supabase/service';
import { recordPaymentOrder } from '@/lib/payments/orders';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimited = await enforceRateLimit(request, [
      { key: `razorpay:ip:${ip}`, max: 15, windowSeconds: 60 },
    ]);
    if (rateLimited) return rateLimited;

    const { tournamentId } = await request.json();

    if (!tournamentId) {
      return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
    }

    const db = getServiceSupabase();
    const { data: trn, error } = await db
      .from('tournaments')
      .select('id, fee, status, name')
      .eq('id', tournamentId)
      .single();

    if (error || !trn) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    if (trn.status === 'Closed') {
      return NextResponse.json({ error: 'Registration is closed for this tournament.' }, { status: 400 });
    }

    const fee = Number(trn.fee) || 0;
    if (fee <= 0) {
      return NextResponse.json({ error: 'This tournament has no payment required.' }, { status: 400 });
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const isProd = process.env.NODE_ENV === 'production';

    if (!keyId || !keySecret) {
      if (isProd) {
        return NextResponse.json(
          { error: 'Payment gateway is not configured.' },
          { status: 503 }
        );
      }
      if (process.env.ALLOW_DEV_MOCK_PAYMENT === 'true') {
        const mockOrderId = `order_mock_${Date.now()}`;
        const mockAmountPaise = Math.round(fee * 100);
        await recordPaymentOrder(db, {
          razorpayOrderId: mockOrderId,
          tournamentId: trn.id,
          amountPaise: mockAmountPaise,
          currency: 'INR',
        });
        return NextResponse.json({
          id: mockOrderId,
          amount: mockAmountPaise,
          currency: 'INR',
          mock: true,
          keyId: 'MOCK_KEY_ID',
        });
      }
      return NextResponse.json(
        { error: 'Payment gateway is not configured.' },
        { status: 503 }
      );
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const amountPaise = Math.round(fee * 100);
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `receipt_${tournamentId.slice(0, 8)}_${Date.now()}`,
    });

    await recordPaymentOrder(db, {
      razorpayOrderId: order.id,
      tournamentId: trn.id,
      amountPaise: Number(order.amount) || amountPaise,
      currency: String(order.currency || 'INR'),
    });

    return NextResponse.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      mock: false,
      keyId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create payment order';
    console.error('Error generating Razorpay Order:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
