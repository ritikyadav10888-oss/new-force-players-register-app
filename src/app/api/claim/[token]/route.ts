import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ token: string }> };

type ClaimOrder = {
  id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  tournament_id: string;
  status: string;
  registration_id: string | null;
  resolved_at: string | null;
  amount_paise: number;
  currency: string | null;
  paid_at: string | null;
  claim_token: string | null;
  claim_expires_at: string | null;
};

async function loadClaimableOrder(
  token: string
): Promise<{ order: ClaimOrder } | { response: NextResponse }> {
  const { rows } = await query<ClaimOrder>(
    `SELECT id, razorpay_order_id, razorpay_payment_id, tournament_id, status,
            registration_id, resolved_at, amount_paise, currency, paid_at,
            claim_token, claim_expires_at
     FROM payment_orders
     WHERE claim_token = $1
     LIMIT 1`,
    [token]
  );
  const order = rows[0];

  if (!order) {
    return { response: NextResponse.json({ error: 'Link not found.' }, { status: 404 }) };
  }

  if (order.registration_id) {
    return {
      response: NextResponse.json(
        { error: 'This payment already has a registration. You are all set.', alreadyDone: true },
        { status: 409 }
      ),
    };
  }
  if (order.status !== 'paid') {
    return {
      response: NextResponse.json({ error: 'This payment is not available.' }, { status: 400 }),
    };
  }
  if (order.resolved_at) {
    return {
      response: NextResponse.json(
        { error: 'This payment was refunded or closed. Contact the organizer.' },
        { status: 410 }
      ),
    };
  }
  if (!order.claim_expires_at || new Date(order.claim_expires_at).getTime() < Date.now()) {
    return {
      response: NextResponse.json(
        { error: 'This link has expired. Ask the organizer for a new link.' },
        { status: 410 }
      ),
    };
  }

  return { order };
}

/** Public: load tournament form + payment summary for a claim link. */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 16) {
      return NextResponse.json({ error: 'Invalid link.' }, { status: 400 });
    }

    const loaded = await loadClaimableOrder(token);
    if ('response' in loaded) return loaded.response;
    const { order } = loaded;

    const [{ rows: tournaments }, { rows: pendings }] = await Promise.all([
      query(
        `SELECT id, name, type, sport, theme, slug, form_config, custom_fields, min_players, max_players
         FROM tournaments WHERE id = $1 LIMIT 1`,
        [order.tournament_id]
      ),
      query<{ payload: unknown }>(
        `SELECT payload FROM pending_registrations WHERE razorpay_order_id = $1 LIMIT 1`,
        [order.razorpay_order_id]
      ),
    ]);

    const tournament = tournaments[0];
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 });
    }

    return NextResponse.json({
      order: {
        amountPaise: order.amount_paise,
        currency: order.currency || 'INR',
        paidAt: order.paid_at,
        razorpayOrderId: order.razorpay_order_id,
        razorpayPaymentId: order.razorpay_payment_id,
      },
      tournament,
      pendingPayload: pendings[0]?.payload ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load claim link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Public: submit registration details against a paid orphan claim link. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 16) {
      return NextResponse.json({ error: 'Invalid link.' }, { status: 400 });
    }

    const loaded = await loadClaimableOrder(token);
    if ('response' in loaded) return loaded.response;
    const { order } = loaded;

    const body = (await request.json()) as { payload?: Record<string, unknown> };
    if (!body.payload || typeof body.payload !== 'object') {
      return NextResponse.json({ error: 'Missing registration details.' }, { status: 400 });
    }

    const { createRegistrationFromPayload } = await import('@/lib/registrations/create');
    const payload = {
      ...body.payload,
      tournamentId: order.tournament_id,
    } as import('@/lib/registrations/create').RegistrationPayload;

    const result = await createRegistrationFromPayload(payload, {
      paymentStatus: 'Paid',
      razorpayOrderId: order.razorpay_order_id,
      razorpayPaymentId: order.razorpay_payment_id,
      paymentOrder: { id: order.id },
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.duplicate ? { duplicate: true } : {}) },
        { status: result.status }
      );
    }

    await query(`DELETE FROM pending_registrations WHERE razorpay_order_id = $1`, [
      order.razorpay_order_id,
    ]);
    await query(
      `UPDATE payment_orders SET claim_token = NULL, claim_expires_at = NULL WHERE id = $1`,
      [order.id]
    );

    return NextResponse.json({ ok: true, registration: result.registration });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to complete registration';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
