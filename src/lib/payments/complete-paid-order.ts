import { query } from '@/lib/db/pool';
import {
  createRegistrationFromPayload,
  type RegistrationPayload,
} from '@/lib/registrations/create';
import {
  buildTeamInviteRegistrationPayload,
  loadInvitePlayers,
  loadTeamInviteById,
  markTeamInvitePaid,
} from '@/lib/team-invites/finalize';
import { isTeamInvitePaid } from '@/lib/team-invites/token';

export type CompletePaidOrderResult =
  | { ok: true; registrationId?: string | null; alreadyConsumed?: boolean; noPending?: boolean }
  | { ok: false; error: string; status: number; duplicate?: boolean; skipped?: boolean };

/** Auto-create registration after Razorpay marks an order paid. */
export async function completePaidOrder(
  razorpayOrderId: string,
  razorpayPaymentId: string | null
): Promise<CompletePaidOrderResult> {
  const { rows: orderRows } = await query<{
    id: string;
    razorpay_order_id: string;
    razorpay_payment_id: string | null;
    tournament_id: string;
    status: string;
    registration_id: string | null;
    team_invite_id: string | null;
  }>(
    `SELECT id, razorpay_order_id, razorpay_payment_id, tournament_id, status,
            registration_id, team_invite_id
     FROM payment_orders WHERE razorpay_order_id = $1 LIMIT 1`,
    [razorpayOrderId]
  );
  const order = orderRows[0];

  if (!order) {
    return { ok: false, error: 'Order not found', status: 404, skipped: true };
  }
  if (order.registration_id || order.status === 'consumed') {
    await query(`DELETE FROM pending_registrations WHERE razorpay_order_id = $1`, [
      razorpayOrderId,
    ]);
    return { ok: true, alreadyConsumed: true };
  }

  if (order.team_invite_id) {
    const invite = await loadTeamInviteById(order.team_invite_id);
    if (!invite) return { ok: true, noPending: true };
    if (isTeamInvitePaid(invite.payment_status)) {
      return { ok: true, alreadyConsumed: true };
    }

    const players = await loadInvitePlayers(invite.id);
    const payload = buildTeamInviteRegistrationPayload(invite, players);
    const paymentId = razorpayPaymentId || order.razorpay_payment_id;

    const result = await createRegistrationFromPayload(payload, {
      paymentStatus: 'Paid',
      razorpayOrderId: order.razorpay_order_id,
      razorpayPaymentId: paymentId,
      paymentOrder: { id: order.id },
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        status: result.status,
        duplicate: result.duplicate === true,
      };
    }

    await markTeamInvitePaid(invite.id, {
      razorpayOrderId: order.razorpay_order_id,
      razorpayPaymentId: paymentId,
      registrationId: (result.registration as { id: string }).id,
    });

    return {
      ok: true,
      registrationId: (result.registration as { id?: string }).id ?? null,
    };
  }

  const { rows: pendingRows } = await query<{
    payload: RegistrationPayload;
    tournament_id: string;
  }>(
    `SELECT payload, tournament_id FROM pending_registrations
     WHERE razorpay_order_id = $1 LIMIT 1`,
    [razorpayOrderId]
  );
  const pending = pendingRows[0];

  if (!pending?.payload) {
    return { ok: true, noPending: true };
  }

  const payload = {
    ...(pending.payload as RegistrationPayload),
    tournamentId: order.tournament_id,
  };

  const paymentId = razorpayPaymentId || order.razorpay_payment_id;

  const result = await createRegistrationFromPayload(payload, {
    paymentStatus: 'Paid',
    razorpayOrderId: order.razorpay_order_id,
    razorpayPaymentId: paymentId,
    paymentOrder: { id: order.id },
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      status: result.status,
      duplicate: result.duplicate === true,
    };
  }

  await query(`DELETE FROM pending_registrations WHERE razorpay_order_id = $1`, [
    razorpayOrderId,
  ]);

  return {
    ok: true,
    registrationId: (result.registration as { id?: string }).id ?? null,
  };
}
