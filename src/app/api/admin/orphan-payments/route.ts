import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';
import { createRegistrationFromPayload } from '@/lib/registrations/create';

/** List orphan payments (paid but never registered) — superadmin only. */
export async function GET(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const db = getServiceSupabase();
    const { data, error } = await db
      .from('orphaned_payments')
      .select('*')
      .order('paid_at', { ascending: false });
    if (error) throw error;

    const rows = data || [];
    const tournamentIds = [...new Set(rows.map((r) => r.tournament_id).filter(Boolean))];
    const orderIds = rows.map((r) => r.razorpay_order_id).filter(Boolean);

    const [tournamentsRes, pendingRes] = await Promise.all([
      tournamentIds.length
        ? db
            .from('tournaments')
            .select('id, type, sport, form_config, custom_fields, min_players, max_players')
            .in('id', tournamentIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      orderIds.length
        ? db.from('pending_registrations').select('razorpay_order_id, payload').in('razorpay_order_id', orderIds)
        : Promise.resolve({ data: [] as { razorpay_order_id: string; payload: unknown }[] }),
    ]);

    const tournamentById = new Map(
      (tournamentsRes.data || []).map((t) => [t.id as string, t])
    );
    const pendingByOrder = new Map(
      (pendingRes.data || []).map((p) => [p.razorpay_order_id, p.payload])
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

    const db = getServiceSupabase();

    const { data: order, error: orderErr } = await db
      .from('payment_orders')
      .select('id, razorpay_order_id, razorpay_payment_id, tournament_id, status, registration_id, resolved_at')
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

    // Force the registration onto the order's own tournament (ignore client value).
    const payload = { ...body.payload, tournamentId: order.tournament_id } as Parameters<
      typeof createRegistrationFromPayload
    >[1];

    const result = await createRegistrationFromPayload(db, payload, {
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

    // Clean up any stored pending payload for this order.
    await db.from('pending_registrations').delete().eq('razorpay_order_id', order.razorpay_order_id);

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

    const db = getServiceSupabase();
    const { error } = await db
      .from('payment_orders')
      .update({ resolved_at: new Date().toISOString(), resolution_note: note || 'Resolved' })
      .eq('id', orderId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update payment order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
