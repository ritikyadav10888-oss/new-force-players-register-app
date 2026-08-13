import type { getServiceSupabase } from '@/lib/supabase/service';
import { resolvePaymentStatus } from '@/lib/payments/resolve-status';
import { validatePaymentOrder } from '@/lib/payments/orders';
import { verifyRazorpayPaymentWithGateway } from '@/lib/razorpay/verify-payment';
import { createRegistrationFromPayload, formatSupabaseError } from '@/lib/registrations/create';
import { isTeamInvitePaid, resolveTeamInviteRosterLimits } from '@/lib/team-invites/token';

type Db = ReturnType<typeof getServiceSupabase>;

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

export async function loadTeamInviteByToken(db: Db, token: string) {
  const { data, error } = await db
    .from('team_invites')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) throw new Error(formatSupabaseError(error, 'Failed to load team invite.'));
  return data as TeamInviteRow | null;
}

export async function loadInvitePlayers(db: Db, inviteId: string) {
  const { data, error } = await db
    .from('team_invite_players')
    .select('*')
    .eq('team_invite_id', inviteId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(formatSupabaseError(error, 'Failed to load team invite players.'));
  return data || [];
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

/** Builds the registration payload from a team invite + its persisted players. */
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

/** Marks a team invite as paid and links it to the created registration. */
export async function markTeamInvitePaid(
  db: Db,
  inviteId: string,
  opts: {
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    registrationId: string;
  }
): Promise<void> {
  await db
    .from('team_invites')
    .update({
      payment_status: 'Paid',
      razorpay_order_id: opts.razorpayOrderId,
      razorpay_payment_id: opts.razorpayPaymentId,
      registration_id: opts.registrationId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inviteId);
}

/** Loads a team invite row by id (used by the payment-webhook recovery path). */
export async function loadTeamInviteById(db: Db, inviteId: string) {
  const { data, error } = await db
    .from('team_invites')
    .select('*')
    .eq('id', inviteId)
    .maybeSingle();

  if (error) throw new Error(formatSupabaseError(error, 'Failed to load team invite.'));
  return data as TeamInviteRow | null;
}

export async function finalizeTeamInvitePayment(
  db: Db,
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
      const { data: reg } = await db
        .from('registrations')
        .select('*')
        .eq('id', invite.registration_id)
        .maybeSingle();
      if (reg) return { ok: true, registration: reg };
    }
    return { ok: false, status: 409, error: 'This team has already been paid and confirmed.' };
  }

  const players = await loadInvitePlayers(db, invite.id);
  const count = players.length;

  const { data: trnLimits } = await db
    .from('tournaments')
    .select('min_players, max_players')
    .eq('id', invite.tournament_id)
    .maybeSingle();

  const { maxPlayers } = resolveTeamInviteRosterLimits({
    tournamentMin: trnLimits?.min_players ?? invite.min_players,
    tournamentMax: trnLimits?.max_players ?? invite.max_players,
    inviteMin: invite.min_players,
    inviteMax: invite.max_players,
  });

  // Pay-first: representative registers themselves (at least 1), then pays.
  // Other players join after payment up to tournament/invite max.
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
    const validation = await validatePaymentOrder(db, {
      razorpayOrderId: payment.razorpayOrderId,
      tournamentId: invite.tournament_id,
      expectedAmountPaise,
    });
    if (validation.ok === false) {
      return { ok: false, status: validation.status, error: validation.error };
    }
    paymentOrder = validation.order;

    const { data: existingReg } = await db
      .from('registrations')
      .select('id')
      .eq('razorpay_payment_id', payment.razorpayPaymentId)
      .maybeSingle();
    if (existingReg) {
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

  const result = await createRegistrationFromPayload(db, payload, {
    paymentStatus: payment.status,
    razorpayOrderId: payment.razorpayOrderId ?? null,
    razorpayPaymentId: payment.razorpayPaymentId ?? null,
    paymentOrder,
  });

  if (result.ok === false) {
    return { ok: false, status: result.status, error: result.error };
  }

  await markTeamInvitePaid(db, invite.id, {
    razorpayOrderId: payment.razorpayOrderId ?? null,
    razorpayPaymentId: payment.razorpayPaymentId ?? null,
    registrationId: result.registration.id as string,
  });

  return { ok: true, registration: result.registration };
}
