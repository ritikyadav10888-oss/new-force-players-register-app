import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';

type OrphanRow = Record<string, unknown>;
type TournamentRow = {
  id: string;
  type: string | null;
  sport: string | null;
  form_config: unknown;
  custom_fields: unknown;
  min_players: number | null;
  max_players: number | null;
};
type PendingRow = { razorpay_order_id: string; payload: unknown };

/** List orphan payments (paid but never registered) — superadmin only. */
export async function GET(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { rows } = await query<OrphanRow>(
      `SELECT * FROM orphaned_payments ORDER BY paid_at DESC`
    );

    const tournamentIds = [
      ...new Set(rows.map((r) => r.tournament_id as string).filter(Boolean)),
    ];
    const orderIds = rows
      .map((r) => r.razorpay_order_id as string)
      .filter(Boolean);

    const [tournamentsRes, pendingRes] = await Promise.all([
      tournamentIds.length
        ? query<TournamentRow>(
            `SELECT id, type, sport, form_config, custom_fields, min_players, max_players
             FROM tournaments WHERE id = ANY($1::uuid[])`,
            [tournamentIds]
          )
        : Promise.resolve({ rows: [] as TournamentRow[] }),
      orderIds.length
        ? query<PendingRow>(
            `SELECT razorpay_order_id, payload
             FROM pending_registrations WHERE razorpay_order_id = ANY($1::text[])`,
            [orderIds]
          )
        : Promise.resolve({ rows: [] as PendingRow[] }),
    ]);

    const tournamentById = new Map(tournamentsRes.rows.map((t) => [t.id, t]));
    const pendingByOrder = new Map(
      pendingRes.rows.map((p) => [p.razorpay_order_id, p.payload])
    );

    const orphans = rows.map((row) => {
      const trn = tournamentById.get(row.tournament_id as string);
      return {
        ...row,
        tournament: trn
          ? {
              type: trn.type,
              sport: trn.sport,
              formConfig: trn.form_config || {},
              customFields: trn.custom_fields || [],
              minPlayers: trn.min_players,
              maxPlayers: trn.max_players,
            }
          : null,
        pendingPrefill: pendingByOrder.get(row.razorpay_order_id as string) ?? null,
      };
    });

    return NextResponse.json({ orphans });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load orphan payments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Manually create a registration for a paid-but-unregistered order (superadmin). */
export async function POST(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const body = (await request.json()) as {
      orderId?: unknown;
      payload?: Record<string, unknown>;
    };
    const orderId = typeof body.orderId === 'string' ? body.orderId : '';
    if (!orderId) {
      return NextResponse.json({ error: 'Missing payment order id.' }, { status: 400 });
    }
    if (!body.payload || typeof body.payload !== 'object') {
      return NextResponse.json({ error: 'Missing registration details.' }, { status: 400 });
    }

    const { rows } = await query<{
      id: string;
      razorpay_order_id: string;
      razorpay_payment_id: string | null;
      tournament_id: string;
      status: string;
      registration_id: string | null;
    }>(
      `SELECT id, razorpay_order_id, razorpay_payment_id, tournament_id, status, registration_id
       FROM payment_orders WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    const order = rows[0];

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

    const { createRegistrationFromPayload } = await import('@/lib/registrations/create');
    const payload = { ...body.payload, tournamentId: order.tournament_id } as Parameters<
      typeof createRegistrationFromPayload
    >[0];

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

    return NextResponse.json({ ok: true, registration: result.registration });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create registration';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Mark an orphan payment resolved (e.g. refunded) so it drops off the list. */
export async function PATCH(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const body = (await request.json()) as { orderId?: unknown; note?: unknown };
    const orderId = typeof body.orderId === 'string' ? body.orderId : '';
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (!orderId) {
      return NextResponse.json({ error: 'Missing payment order id.' }, { status: 400 });
    }

    await query(
      `UPDATE payment_orders
       SET resolved_at = now(), resolution_note = $2
       WHERE id = $1`,
      [orderId, note || 'Resolved']
    );

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update payment order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
