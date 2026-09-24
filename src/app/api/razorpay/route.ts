import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { query } from '@/lib/db/pool';
import { recordPaymentOrder } from '@/lib/payments/orders';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { parseSportsConfig } from '@/lib/multi-sport';
import { parseAgeCategories } from '@/lib/age-categories';
import {
  parseEligibilityMatrix,
  validateSelectedSportsAgainstMatrix,
} from '@/lib/eligibility-matrix';
import {
  resolveTournamentFeeMode,
  resolveTournamentPayable,
} from '@/lib/fee-mode';
import { applyEntryFormCharge, entryFormsFromConfig, findEntryForm } from '@/lib/entry-forms';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimited = await enforceRateLimit(request, [
      { key: `razorpay:ip:${ip}`, max: 15, windowSeconds: 60 },
    ]);
    if (rateLimited) return rateLimited;

    const body = (await request.json()) as {
      tournamentId?: unknown;
      selectedSportIds?: unknown;
      selectedAgeCategoryId?: unknown;
      enrollmentGender?: unknown;
      entryFormId?: unknown;
      entryCondition?: unknown;
    };
    const tournamentId = typeof body.tournamentId === 'string' ? body.tournamentId : '';

    if (!tournamentId) {
      return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
    }

    const { rows } = await query<{
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
      [tournamentId]
    );
    const trn = rows[0];

    if (!trn) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    if (trn.status === 'Closed') {
      return NextResponse.json({ error: 'Registration is closed for this tournament.' }, { status: 400 });
    }

    const sportsConfig = parseSportsConfig(trn.sports_config);
    const ageCats = parseAgeCategories(trn.age_categories);
    const selectedAgeCategoryId =
      typeof body.selectedAgeCategoryId === 'string' ? body.selectedAgeCategoryId.trim() : '';
    const feeMode = resolveTournamentFeeMode({
      formConfig: trn.form_config,
      sportsConfig,
      ageCategories: ageCats,
    });
    let resolved = resolveTournamentPayable({
      feeMode,
      legacyFee: Number(trn.fee) || 0,
      sportsConfig,
      selectedSportIds: body.selectedSportIds,
      ageCategories: ageCats,
      selectedAgeCategoryId,
      formConfig: trn.form_config,
    });
    const entryForms = entryFormsFromConfig(trn.form_config);
    const entryFormId = typeof body.entryFormId === 'string' ? body.entryFormId.trim() : '';
    const entryCondition = body.entryCondition === 'yes' || body.entryCondition === 'no' ? body.entryCondition : '';
    if (entryForms.length > 0) {
      const chosen = findEntryForm(entryForms, entryFormId);
      if (!chosen) {
        return NextResponse.json({ error: 'Choose a registration type.' }, { status: 400 });
      }
      if (chosen.conditionQuestion && !entryCondition) {
        return NextResponse.json({ error: 'Answer the Yes or No question.' }, { status: 400 });
      }
      resolved = applyEntryFormCharge(resolved, entryForms, entryFormId, entryCondition);
    }

    if (resolved.multi && resolved.selected.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one sport before payment.' },
        { status: 400 }
      );
    }

    if (ageCats.length > 0 && (!selectedAgeCategoryId || !ageCats.some((c) => c.id === selectedAgeCategoryId))) {
      return NextResponse.json(
        { error: 'Select a valid age category before payment.' },
        { status: 400 }
      );
    }

    const eligibilityMatrix = parseEligibilityMatrix(
      trn.form_config && typeof trn.form_config === 'object'
        ? (trn.form_config as Record<string, unknown>).eligibilityMatrix
        : null
    );
    const matrixCheck = validateSelectedSportsAgainstMatrix({
      matrix: eligibilityMatrix,
      categoryId: selectedAgeCategoryId,
      gender: typeof body.enrollmentGender === 'string' ? body.enrollmentGender : '',
      selectedSportIds: resolved.selected.map((s) => s.id),
    });
    if (!matrixCheck.ok) {
      return NextResponse.json({ error: matrixCheck.error }, { status: 400 });
    }

    const feeBreakdown = resolved.breakdown;
    const fee = resolved.fee;
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
        await recordPaymentOrder({
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
          feeBreakdown,
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

    await recordPaymentOrder({
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
      feeBreakdown,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create payment order';
    console.error('Error generating Razorpay Order:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
