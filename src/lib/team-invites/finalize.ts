import { query } from '@/lib/db/pool';
import { resolvePaymentStatus } from '@/lib/payments/resolve-status';
import { validatePaymentOrder } from '@/lib/payments/orders';
import { verifyRazorpayPaymentWithGateway } from '@/lib/razorpay/verify-payment';
import { createRegistrationFromPayload, formatDbError } from '@/lib/registrations/create';
import { isTeamInvitePaid, resolveTeamInviteRosterLimits } from '@/lib/team-invites/token';

export type TeamInviteRow = {
  id: string;
  tournament_id: string;
  token: string;
  team_name: string;
  representative: string;
  contact: string;
  team_logo_url: string | null;
  min_players: number;
  max_players: number;
  selected_sports: string[];
  teams_by_sport: Record<string, string>;
  fee_breakdown: unknown[];
  selected_age_category_id: string | null;
  team_custom_values: Record<string, string>;
  payment_status: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  registration_id: string | null;
};

export async function loadTeamInviteByToken(token: string) {
  const { rows } = await query<TeamInviteRow>(
    `SELECT * FROM team_invites WHERE token = $1 LIMIT 1`,
    [token]
  );
  return rows[0] ?? null;
}

export async function loadInvitePlayers(inviteId: string) {
  const { rows } = await query(
    `SELECT * FROM team_invite_players
     WHERE team_invite_id = $1
     ORDER BY created_at ASC`,
    [inviteId]
  );
  return rows;
}

function mapInvitePlayerToPayload(p: Record<string, unknown>) {
  return {
    name: p.name,
    email: p.email,
    phone: p.phone,
    emergencyContact: p.emergency_contact,
    dob: p.dob,
    age: p.age,
    ageCategory: p.age_category,
    gender: p.gender,
    aadhar: p.aadhar,
    jerseyName: p.jersey_name,
    jerseyNumber: p.jersey_number,
    jerseySize: p.jersey_size,
    photo: p.photo_url,
    role: p.role,
    battingHand: p.batting_hand,
    bowlingType: p.bowling_type,
    allRounderType: p.all_rounder_type,
    sportProfiles: p.sport_profiles,
    customValues: p.custom_values,
  };
}

export function buildTeamInviteRegistrationPayload(
  invite: TeamInviteRow,
  players: Record<string, unknown>[]
) {
  return {
    tournamentId: invite.tournament_id,
    teamName: invite.team_name,
    representative: invite.representative,
    contact: invite.contact,
    teamLogoUrl: invite.team_logo_url,
    selectedSports: Array.isArray(invite.selected_sports) ? invite.selected_sports : [],
    feeBreakdown: (Array.isArray(invite.fee_breakdown)
      ? invite.fee_breakdown
      : []) as Array<{ sportId: string; name: string; fee: number }>,
    teamsBySport:
      invite.teams_by_sport && typeof invite.teams_by_sport === 'object'
        ? invite.teams_by_sport
        : {},
    teamCustomValues:
      invite.team_custom_values && typeof invite.team_custom_values === 'object'
        ? invite.team_custom_values
        : {},
    players: players.map((p) => mapInvitePlayerToPayload(p)),
  };
}

export async function markTeamInvitePaid(
  inviteId: string,
  opts: {
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    registrationId: string;
  }
): Promise<void> {
  await query(
    `UPDATE team_invites
     SET payment_status = 'Paid',
         razorpay_order_id = $2,
         razorpay_payment_id = $3,
         registration_id = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [inviteId, opts.razorpayOrderId, opts.razorpayPaymentId, opts.registrationId]
  );
}

export async function loadTeamInviteById(inviteId: string) {
  const { rows } = await query<TeamInviteRow>(
    `SELECT * FROM team_invites WHERE id = $1 LIMIT 1`,
    [inviteId]
  );
  return rows[0] ?? null;
}

export async function finalizeTeamInvitePayment(
  invite: TeamInviteRow,
  opts: {
    tournamentFee: number;
    razorpayOrderId?: string | null;
    razorpayPaymentId?: string | null;
    razorpaySignature?: string | null;
    devMockPayment?: boolean;
  }
): Promise<
  | { ok: true; registration: Record<string, unknown> }
  | { ok: false; status: number; error: string }
> {
  if (isTeamInvitePaid(invite.payment_status)) {
    if (invite.registration_id) {
      const { rows } = await query(
        `SELECT * FROM registrations WHERE id = $1 LIMIT 1`,
        [invite.registration_id]
      );
      if (rows[0]) return { ok: true, registration: rows[0] };
    }
    return { ok: false, status: 409, error: 'This team has already been paid and confirmed.' };
  }

  const players = await loadInvitePlayers(invite.id);
  const count = players.length;

  const { rows: trnRows } = await query<{
    min_players: number | null;
    max_players: number | null;
  }>(`SELECT min_players, max_players FROM tournaments WHERE id = $1 LIMIT 1`, [
    invite.tournament_id,
  ]);
  const trnLimits = trnRows[0];

  const { maxPlayers } = resolveTeamInviteRosterLimits({
    tournamentMin: trnLimits?.min_players ?? invite.min_players,
    tournamentMax: trnLimits?.max_players ?? invite.max_players,
    inviteMin: invite.min_players,
    inviteMax: invite.max_players,
  });

  if (count < 1) {
    return {
      ok: false,
      status: 400,
      error: 'Representative must fill their own player details before payment.',
    };
  }

  if (count > maxPlayers) {
    return {
      ok: false,
      status: 400,
      error: `Team roster exceeds maximum of ${maxPlayers} players.`,
    };
  }

  let payment;
  try {
    payment = await resolvePaymentStatus(opts.tournamentFee, {
      razorpayOrderId: opts.razorpayOrderId,
      razorpayPaymentId: opts.razorpayPaymentId,
      razorpaySignature: opts.razorpaySignature,
      devMockPayment: opts.devMockPayment === true,
    });
  } catch (payErr: unknown) {
    const message = payErr instanceof Error ? payErr.message : 'Payment verification failed';
    return { ok: false, status: 402, error: message };
  }

  let paymentOrder = null;
  if (opts.tournamentFee > 0) {
    if (!payment.razorpayOrderId || !payment.razorpayPaymentId) {
      return {
        ok: false,
        status: 402,
        error: 'Payment details are missing. Please complete payment again.',
      };
    }

    const expectedAmountPaise = Math.round(opts.tournamentFee * 100);
    const validation = await validatePaymentOrder({
      razorpayOrderId: payment.razorpayOrderId,
      tournamentId: invite.tournament_id,
      expectedAmountPaise,
    });
    if (validation.ok === false) {
      return { ok: false, status: validation.status, error: validation.error };
    }
    paymentOrder = validation.order;

    const { rows: existingRegs } = await query<{ id: string }>(
      `SELECT id FROM registrations WHERE razorpay_payment_id = $1 LIMIT 1`,
      [payment.razorpayPaymentId]
    );
    if (existingRegs[0]) {
      return { ok: false, status: 409, error: 'This payment has already been used to register.' };
    }

    const gateway = await verifyRazorpayPaymentWithGateway({
      orderId: payment.razorpayOrderId,
      paymentId: payment.razorpayPaymentId,
      expectedAmountPaise,
    });
    if (gateway.ok === false) {
      return { ok: false, status: 402, error: gateway.error };
    }
  }

  const payload = buildTeamInviteRegistrationPayload(invite, players);

  const result = await createRegistrationFromPayload(payload, {
    paymentStatus: payment.status,
    razorpayOrderId: payment.razorpayOrderId ?? null,
    razorpayPaymentId: payment.razorpayPaymentId ?? null,
    paymentOrder,
  });

  if (result.ok === false) {
    return { ok: false, status: result.status, error: result.error };
  }

  await markTeamInvitePaid(invite.id, {
    razorpayOrderId: payment.razorpayOrderId ?? null,
    razorpayPaymentId: payment.razorpayPaymentId ?? null,
    registrationId: result.registration.id as string,
  });

  return { ok: true, registration: result.registration };
}

export { formatDbError as formatSupabaseError };
