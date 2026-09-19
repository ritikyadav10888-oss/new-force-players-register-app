import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { parseSportsConfig } from '@/lib/multi-sport';
import { parseAgeCategories } from '@/lib/age-categories';
import {
  resolveTournamentFeeMode,
  resolveTournamentPayable,
} from '@/lib/fee-mode';
import { finalizeTeamInvitePayment, loadTeamInviteByToken } from '@/lib/team-invites/finalize';
import {
  isTeamInvitePaid,
  teamInviteLivePath,
  teamInvitePlayerPath,
} from '@/lib/team-invites/token';
import {
  appOriginFromRequest,
  sendTeamInviteWhatsApp,
} from '@/lib/whatsapp/cloud-api';
import { sendPaymentInvoice } from '@/lib/invoices/send-payment-invoice';
import { loadInvitePlayers } from '@/lib/team-invites/finalize';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ token: string }> };

/** Public: representative completes payment and confirms the team registration. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const ip = getClientIp(request);
    const rateLimited = await enforceRateLimit(request, [
      { key: `team-invite-complete:ip:${ip}`, max: 20, windowSeconds: 60 },
    ]);
    if (rateLimited) return rateLimited;

    const { token } = await ctx.params;
    const body = await request.json();
    const invite = await loadTeamInviteByToken(token);

    if (!invite) {
      return NextResponse.json({ error: 'Team link not found' }, { status: 404 });
    }

    if (isTeamInvitePaid(invite.payment_status) && invite.registration_id) {
      const { rows } = await query(`SELECT * FROM registrations WHERE id = $1 LIMIT 1`, [
        invite.registration_id,
      ]);
      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        registration: rows[0] ?? null,
      });
    }

    const { rows: trnRows } = await query<{
      id: string;
      name: string;
      slug: string;
      fee: number | null;
      sports_config: unknown;
      age_categories: unknown;
      form_config: unknown;
      status: string;
      max_players: number | null;
    }>(
      `SELECT id, name, slug, fee, sports_config, age_categories, form_config, status, max_players
       FROM tournaments WHERE id = $1 LIMIT 1`,
      [invite.tournament_id]
    );
    const trn = trnRows[0];

    if (!trn || trn.status === 'Closed') {
      return NextResponse.json({ error: 'Registration is closed.' }, { status: 400 });
    }

    const sportsConfig = parseSportsConfig(trn.sports_config);
    const ageCats = parseAgeCategories(trn.age_categories);
    const selectedSports = Array.isArray(invite.selected_sports) ? invite.selected_sports : [];
    const feeMode = resolveTournamentFeeMode({
      formConfig: trn.form_config,
      sportsConfig,
      ageCategories: ageCats,
    });
    const resolved = resolveTournamentPayable({
      feeMode,
      legacyFee: Number(trn.fee) || 0,
      sportsConfig,
      selectedSportIds: selectedSports,
      ageCategories: ageCats,
      selectedAgeCategoryId: invite.selected_age_category_id || '',
    });

    const result = await finalizeTeamInvitePayment(invite, {
      tournamentFee: resolved.fee,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
      devMockPayment: body.devMockPayment === true,
    });

    if (result.ok === false) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const origin = appOriginFromRequest(request);
    const slug = String(trn.slug || '');
    const playerPath = teamInvitePlayerPath(slug, token);
    const livePath = teamInviteLivePath(slug, token);
    const whatsapp = await sendTeamInviteWhatsApp({
      phone: invite.contact,
      teamName: invite.team_name,
      tournamentName: trn.name,
      playerUrl: `${origin}${playerPath}`,
      liveUrl: `${origin}${livePath}`,
      maxPlayers: Number(trn.max_players) || null,
    });

    const paymentReference =
      (body.razorpayPaymentId as string | undefined) ||
      invite.razorpay_payment_id ||
      null;
    if (paymentReference) {
      const invitePlayers = await loadInvitePlayers(invite.id);
      void sendPaymentInvoice({
        tournamentName: trn.name,
        amountPaise: Math.round(resolved.fee * 100),
        currency: 'INR',
        paymentId: paymentReference,
        orderId: (body.razorpayOrderId as string | undefined) || invite.razorpay_order_id,
        teamName: invite.team_name,
        representative: invite.representative,
        players: invitePlayers as Array<Record<string, unknown>>,
      }).then((invoice) => {
        if (!invoice.sent && !invoice.skipped) {
          console.warn('[team-invite/complete] invoice email failed:', invoice.error);
        }
      });
    }

    return NextResponse.json({
      success: true,
      registration: result.registration,
      paymentReference: body.razorpayPaymentId ?? null,
      whatsapp: {
        sent: whatsapp.ok === true,
        skipped: whatsapp.ok === false ? Boolean(whatsapp.skipped) : false,
        error: whatsapp.ok === false ? whatsapp.error : null,
        mode: whatsapp.ok === true ? whatsapp.mode : null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to complete team registration';
    console.error('[api/team-invites/[token]/complete POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
