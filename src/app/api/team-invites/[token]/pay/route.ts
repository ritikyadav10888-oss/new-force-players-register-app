import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { query } from '@/lib/db/pool';
import { recordPaymentOrder } from '@/lib/payments/orders';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { parseSportsConfig } from '@/lib/multi-sport';
import { parseAgeCategories } from '@/lib/age-categories';
import {
  resolveTournamentFeeMode,
  resolveTournamentPayable,
} from '@/lib/fee-mode';
import { loadInvitePlayers, loadTeamInviteByToken } from '@/lib/team-invites/finalize';
import { isTeamInvitePaid } from '@/lib/team-invites/token';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ token: string }> };

function paymentOrderErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; error?: { description?: unknown; code?: unknown } };
    if (typeof e.message === 'string' && e.message.trim()) return e.message;
    if (typeof e.error?.description === 'string' && e.error.description.trim()) {
      return e.error.description;
    }
  }
  return 'Failed to create payment order';
}

/** Public: create Razorpay order for team representative payment. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const ip = getClientIp(request);
    const rateLimited = await enforceRateLimit(request, [
      { key: `team-invite-pay:ip:${ip}`, max: 15, windowSeconds: 60 },
    ]);
    if (rateLimited) return rateLimited;

    const { token } = await ctx.params;
    const invite = await loadTeamInviteByToken(token);

    if (!invite) {
      return NextResponse.json({ error: 'Team link not found' }, { status: 404 });
    }

    if (isTeamInvitePaid(invite.payment_status)) {
      return NextResponse.json({ error: 'This team is already paid and confirmed.' }, { status: 409 });
    }

    const players = await loadInvitePlayers(invite.id);
    if (players.length < 1) {
      return NextResponse.json(
        {
          error: 'Representative must fill their own player details before payment.',
        },
        { status: 400 }
      );
    }

    const { rows: trnRows } = await query<{
      id: string;
      fee: number | null;
      status: string;
      name: string;
      sports_config: unknown;
      age_categories: unknown;
      form_config: unknown;
    }>(
      `SELECT id, fee, status, name, sports_config, age_categories, form_config
       FROM tournaments WHERE id = $1 LIMIT 1`,
      [invite.tournament_id]
    );
    const trn = trnRows[0];

    if (!trn) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    if (trn.status === 'Closed') {
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

    const fee = resolved.fee;
    if (fee <= 0) {
      return NextResponse.json({
        free: true,
        fee: 0,
        feeBreakdown: resolved.breakdown,
        playerCount: players.length,
      });
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
        const mockId = `order_mock_${Date.now()}`;
        await recordPaymentOrder({
          razorpayOrderId: mockId,
          tournamentId: trn.id,
          amountPaise: Math.round(fee * 100),
          teamInviteId: invite.id,
        });
        return NextResponse.json({
          mock: true,
          id: mockId,
          amount: Math.round(fee * 100),
          currency: 'INR',
          fee,
          feeBreakdown: resolved.breakdown,
          playerCount: players.length,
        });
      }
      return NextResponse.json(
        {
          error:
            'Payment gateway is not configured. Set Razorpay keys or ALLOW_DEV_MOCK_PAYMENT=true for local testing.',
        },
        { status: 503 }
      );
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const amountPaise = Math.round(fee * 100);

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `ti_${invite.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        tournamentId: trn.id,
        teamInviteId: invite.id,
        teamName: invite.team_name,
      },
    });

    await recordPaymentOrder({
      razorpayOrderId: order.id,
      tournamentId: trn.id,
      amountPaise,
      teamInviteId: invite.id,
    });

    return NextResponse.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      fee,
      feeBreakdown: resolved.breakdown,
      playerCount: players.length,
    });
  } catch (err: unknown) {
    const message = paymentOrderErrorMessage(err);
    console.error('[api/team-invites/[token]/pay POST]', message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
