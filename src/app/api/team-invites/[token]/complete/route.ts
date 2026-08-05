import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
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
    const db = getServiceSupabase();
    const invite = await loadTeamInviteByToken(db, token);

    if (!invite) {
      return NextResponse.json({ error: 'Team link not found' }, { status: 404 });
    }

    if (isTeamInvitePaid(invite.payment_status) && invite.registration_id) {
      const { data: reg } = await db
        .from('registrations')
        .select('*')
        .eq('id', invite.registration_id)
        .maybeSingle();
      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        registration: reg,
      });
    }

    const { data: trn } = await db
      .from('tournaments')
      .select('id, name, slug, fee, sports_config, age_categories, form_config, status, max_players')
      .eq('id', invite.tournament_id)
      .single();

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

    const result = await finalizeTeamInvitePayment(db, invite, {
      tournamentFee: resolved.fee,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
      devMockPayment: body.devMockPayment === true,
    });

    if (result.ok === false) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
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
