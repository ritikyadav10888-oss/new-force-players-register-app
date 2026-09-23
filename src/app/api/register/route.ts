import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { resolvePaymentStatus } from '@/lib/payments/resolve-status';
import { validatePaymentOrder, type PaymentOrderRow } from '@/lib/payments/orders';
import { verifyRazorpayPaymentWithGateway } from '@/lib/razorpay/verify-payment';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  buildTeamOccupancyFromRegs,
  isSoloTournamentType,
  parsePrecreatedTeams,
  parseSportsConfig,
  resolveTeamsBySport,
  rosterBoundsForSelection,
  seatsRemaining,
  seatsUsed,
  soloTournamentRosterBounds,
  teamSportsFromSelection,
} from '@/lib/multi-sport';
import { parseAgeCategories } from '@/lib/age-categories';
import {
  parseEligibilityMatrix,
  validateSelectedSportsAgainstMatrix,
} from '@/lib/eligibility-matrix';
import {
  resolveTournamentFeeMode,
  resolveTournamentPayable,
} from '@/lib/fee-mode';

export const runtime = 'nodejs';

function isFutureDob(dobString: unknown): boolean {
  if (typeof dobString !== 'string') return false;
  if (!dobString) return false;
  const d = new Date(dobString);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  const dobDateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return dobDateOnly > todayDateOnly;
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimited = await enforceRateLimit(request, [
      { key: `register:ip:${ip}`, max: 20, windowSeconds: 60 },
    ]);
    if (rateLimited) return rateLimited;

    const body = await request.json();

    const { rows: trnRows } = await query<{
      id: string;
      status: string;
      name: string;
      fee: number | null;
      form_config: unknown;
      sports_config: unknown;
      precreated_teams: unknown;
      type: string;
      min_players: number | null;
      max_players: number | null;
      age_categories: unknown;
    }>(
      `SELECT id, status, name, fee, form_config, sports_config, precreated_teams,
              type, min_players, max_players, age_categories
       FROM tournaments WHERE id = $1 LIMIT 1`,
      [body.tournamentId]
    );
    const trn = trnRows[0];

    if (!trn) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    if (trn.status === 'Closed') {
      return NextResponse.json(
        {
          error: `Registration has closed for "${trn.name}" because the tournament is completed.`,
        },
        { status: 400 }
      );
    }

    const sportsConfig = parseSportsConfig(trn.sports_config);
    const precreatedTeams = parsePrecreatedTeams(trn.precreated_teams);
    const ageCats = parseAgeCategories(trn.age_categories);
    const selectedAgeCategoryId =
      typeof body.selectedAgeCategoryId === 'string' ? body.selectedAgeCategoryId.trim() : '';
    const feeMode = resolveTournamentFeeMode({
      formConfig: trn.form_config,
      sportsConfig,
      ageCategories: ageCats,
    });
    const feeResolved = resolveTournamentPayable({
      feeMode,
      legacyFee: Number(trn.fee) || 0,
      sportsConfig,
      selectedSportIds: body.selectedSports ?? body.selectedSportIds,
      ageCategories: ageCats,
      selectedAgeCategoryId,
      formConfig: trn.form_config,
    });

    if (feeResolved.multi && feeResolved.selected.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one sport to register.' },
        { status: 400 }
      );
    }

    if (ageCats.length > 0) {
      if (!selectedAgeCategoryId || !ageCats.some((c) => c.id === selectedAgeCategoryId)) {
        return NextResponse.json(
          { error: 'Select a valid age category to register.' },
          { status: 400 }
        );
      }
    }

    const eligibilityMatrix = parseEligibilityMatrix(
      trn.form_config && typeof trn.form_config === 'object'
        ? (trn.form_config as Record<string, unknown>).eligibilityMatrix
        : null
    );
    const enrollmentGender =
      typeof body.enrollmentGender === 'string'
        ? body.enrollmentGender
        : Array.isArray(body.players) && body.players[0]?.gender
          ? String(body.players[0].gender)
          : '';
    const matrixCheck = validateSelectedSportsAgainstMatrix({
      matrix: eligibilityMatrix,
      categoryId: selectedAgeCategoryId,
      gender: enrollmentGender,
      selectedSportIds: feeResolved.selected.map((s) => s.id),
    });
    if (!matrixCheck.ok) {
      return NextResponse.json({ error: matrixCheck.error }, { status: 400 });
    }

    const feeBreakdown = feeResolved.breakdown;
    const tournamentFee = feeResolved.fee;
    if (tournamentFee < 0) {
      return NextResponse.json({ error: 'Tournament fee cannot be negative.' }, { status: 400 });
    }

    const soloForced = isSoloTournamentType(trn.type);
    const bounds = soloForced
      ? soloTournamentRosterBounds(feeResolved.selected)
      : feeResolved.multi
        ? rosterBoundsForSelection(feeResolved.selected)
        : {
            minPlayers: trn.type === 'Team' ? Number(trn.min_players) || 1 : 1,
            maxPlayers: Number(trn.max_players) || 1,
            needsTeamSlot: trn.type === 'Team',
            hasTeamSport: trn.type === 'Team',
            hasDoubles: false,
            individualOnly: trn.type !== 'Team',
          };

    if (soloForced) {
      // Solo tournament: no team capacity maps; name from lead player.
      body.teamsBySport = {};
      body.precreatedTeamId = null;
      if (Array.isArray(body.players) && body.players[0]?.name) {
        body.teamName = body.teamName || body.players[0].name;
        body.representative = body.representative || body.players[0].name;
      }
    } else if (bounds.needsTeamSlot) {
      const teamResolve = resolveTeamsBySport({
        selected: feeResolved.selected,
        teamsBySport: body.teamsBySport,
        sharedTeamName: typeof body.teamName === 'string' ? body.teamName : '',
        precreatedTeams,
      });
      if (!teamResolve.ok) {
        return NextResponse.json({ error: teamResolve.error }, { status: 400 });
      }
      body.teamsBySport = teamResolve.teamsBySport;
      body.precreatedTeamId = null;
      if (teamResolve.primaryTeamName) {
        body.teamName = teamResolve.primaryTeamName;
      }

      // Team max capacity: block if adding this roster would exceed max for any team sport.
      const incomingPlayers = Array.isArray(body.players) ? body.players.length : 0;
      if (incomingPlayers > 0) {
        const { rows: existingRegs } = await query<{
          payment_status: string | null;
          teams_by_sport: unknown;
          players: { id: string }[];
        }>(
          `SELECT r.payment_status, r.teams_by_sport,
                  COALESCE(
                    json_agg(json_build_object('id', p.id)) FILTER (WHERE p.id IS NOT NULL),
                    '[]'
                  ) AS players
           FROM registrations r
           LEFT JOIN players p ON p.registration_id = r.id
           WHERE r.tournament_id = $1
           GROUP BY r.id, r.payment_status, r.teams_by_sport`,
          [body.tournamentId]
        );
        const occupancy = buildTeamOccupancyFromRegs(
          existingRegs.map((r) => ({
            ...r,
            players: Array.isArray(r.players) ? r.players : [],
          }))
        );
        for (const sport of teamSportsFromSelection(feeResolved.selected)) {
          const teamName = teamResolve.teamsBySport[sport.id];
          if (!teamName) continue;
          const left = seatsRemaining(sport, teamName, occupancy);
          if (incomingPlayers > left) {
            const used = seatsUsed(sport, teamName, occupancy);
            return NextResponse.json(
              {
                error: `${sport.name} team "${teamName}" is full or nearly full (${used}/${sport.maxPlayers}). Cannot add ${incomingPlayers} more player(s) — only ${left} seat(s) left.`,
                teamFull: true,
              },
              { status: 409 }
            );
          }
        }
      }
    }

    if (body.players && Array.isArray(body.players)) {
      const count = body.players.length;
      if (count < bounds.minPlayers || count > bounds.maxPlayers) {
        return NextResponse.json(
          {
            error: `This registration needs between ${bounds.minPlayers} and ${bounds.maxPlayers} player(s). You submitted ${count}.`,
          },
          { status: 400 }
        );
      }
    }

    body.selectedSports = feeResolved.selected.map((s) => s.id);
    body.feeBreakdown = feeBreakdown;

    if (body.players && Array.isArray(body.players)) {
      const badDobIdx = body.players.findIndex((p: any) => isFutureDob(p?.dob));
      if (badDobIdx !== -1) {
        return NextResponse.json(
          { error: `DOB cannot be a future date (player ${badDobIdx + 1}).` },
          { status: 400 }
        );
      }
    }

    // Within-roster duplicate check: the same person (phone + name + DOB) must
    // not appear twice in a SINGLE submission (e.g. two identical players in one
    // team). This is independent of the database and catches repeats even before
    // any registration is saved. Different people (any of the three differs) and
    // players without full identity data are unaffected.
    if (body.players && Array.isArray(body.players)) {
      const normNameLocal = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
      const normTextLocal = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
      const seenInRoster = new Set<string>();
      for (let i = 0; i < body.players.length; i++) {
        const p = body.players[i] as { phone?: unknown; name?: unknown; dob?: unknown };
        const phone = normTextLocal(p.phone);
        const name = normNameLocal(p.name);
        const dob = normTextLocal(p.dob);
        if (!phone || !name || !dob) continue;
        const key = `${phone}|${name}|${dob}`;
        if (seenInRoster.has(key)) {
          return NextResponse.json(
            {
              duplicate: true,
              sameRoster: true,
              duplicatePlayerName: normTextLocal(p.name) || null,
              error: `The same player (${normTextLocal(p.name) || 'player'}) is listed more than once in this registration. Each player must be unique (name, date of birth and phone).`,
            },
            { status: 400 }
          );
        }
        seenInRoster.add(key);
      }
    }

    if (body.players && Array.isArray(body.players)) {
      const emails = body.players.map((p: { email?: string }) => p.email).filter(Boolean);
      const phones = body.players.map((p: { phone?: string }) => p.phone).filter(Boolean);

      if (emails.length > 0 || phones.length > 0) {
        const { rows: regs } = await query<{ id: string }>(
          `SELECT id FROM registrations WHERE tournament_id = $1`,
          [body.tournamentId]
        );

        if (regs.length > 0) {
          const regIds = regs.map((r) => r.id);

          const { rows: existingPlayers } = await query<{
            registration_id: string;
            email: string | null;
            phone: string | null;
            name: string | null;
            dob: string | null;
          }>(
            `SELECT registration_id, email, phone, name, dob
             FROM players WHERE registration_id = ANY($1::uuid[])`,
            [regIds]
          );

          // A duplicate is only a genuine repeat of the SAME person: phone +
          // name + DOB must all match. This lets families/kids share one contact
          // number (unlimited entries) while still blocking true double-entries.
          const normName = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
          const normText = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
          const identityKey = (phone: string, name: string, dob: string) => `${phone}|${name}|${dob}`;

          const incomingIdentities = new Set(
            (body.players as Array<{ phone?: unknown; name?: unknown; dob?: unknown }>)
              .map((p) => {
                const phone = normText(p.phone);
                const name = normName(p.name);
                const dob = normText(p.dob);
                return phone && name && dob ? identityKey(phone, name, dob) : null;
              })
              .filter((k): k is string => k !== null)
          );

          const match = existingPlayers.find((p) => {
            const phone = normText(p.phone);
            const name = normName(p.name);
            const dob = normText(p.dob);
            if (!phone || !name || !dob) return false;
            return incomingIdentities.has(identityKey(phone, name, dob));
          });

          if (match) {
            const { rows: matchedRegs } = await query<{
              team_name: string | null;
              team_logo_url: string | null;
            }>(
              `SELECT team_name, team_logo_url FROM registrations WHERE id = $1 LIMIT 1`,
              [match.registration_id]
            );
            const matchedReg = matchedRegs[0];

            const duplicateTeamLogoUrl: string | null = matchedReg?.team_logo_url || null;

            return NextResponse.json(
              {
                duplicate: true,
                duplicatePlayerName: match.name || null,
                duplicateTeamName: matchedReg?.team_name || null,
                duplicateTeamLogo: duplicateTeamLogoUrl,
                error:
                  'This player (same name, date of birth and contact number) is already registered for this tournament.',
              },
              { status: 400 }
            );
          }
        }
      }
    }

    if (body.dryRun) {
      return NextResponse.json({ success: true, duplicate: false });
    }

    // Defense in depth: if the tournament requires a player photo, reject any
    // real submission missing one before touching payment or the database.
    const photoConfig = (trn as { form_config?: { photo?: { enabled?: boolean; required?: boolean } } })
      .form_config?.photo;
    if (photoConfig?.enabled && photoConfig?.required && Array.isArray(body.players)) {
      const missingIdx = body.players.findIndex((p: { photo?: unknown }) => {
        const photo = typeof p?.photo === 'string' ? p.photo.trim() : '';
        return !photo;
      });
      if (missingIdx !== -1) {
        return NextResponse.json(
          { error: `A photo is required for every player (missing for player ${missingIdx + 1}).` },
          { status: 400 }
        );
      }
    }

    let payment;
    try {
      payment = await resolvePaymentStatus(tournamentFee, {
        razorpayOrderId: body.razorpayOrderId,
        razorpayPaymentId: body.razorpayPaymentId,
        razorpaySignature: body.razorpaySignature,
        devMockPayment: body.devMockPayment === true,
      });
    } catch (payErr: unknown) {
      const message = payErr instanceof Error ? payErr.message : 'Payment verification failed';
      return NextResponse.json({ error: message }, { status: 402 });
    }

    // Paid tournaments: enforce that the payment was for THIS tournament, for the
    // correct fee, and has not been used before (anti-replay / fee-tamper).
    let paymentOrder: PaymentOrderRow | null = null;
    if (tournamentFee > 0) {
      if (!payment.razorpayOrderId || !payment.razorpayPaymentId) {
        return NextResponse.json(
          { error: 'Payment details are missing. Please complete payment again.' },
          { status: 402 }
        );
      }

      const expectedAmountPaise = Math.round(tournamentFee * 100);

      const validation = await validatePaymentOrder({
        razorpayOrderId: payment.razorpayOrderId,
        tournamentId: body.tournamentId,
        expectedAmountPaise,
      });
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: validation.status });
      }
      paymentOrder = validation.order;

      // Single-use: reject a payment id already attached to a registration.
      const { rows: existingRegs } = await query<{ id: string }>(
        `SELECT id FROM registrations WHERE razorpay_payment_id = $1 LIMIT 1`,
        [payment.razorpayPaymentId]
      );
      if (existingRegs[0]) {
        return NextResponse.json(
          { error: 'This payment has already been used to register.' },
          { status: 409 }
        );
      }

      // Authoritative gateway check (skipped automatically for mock/dev).
      const gateway = await verifyRazorpayPaymentWithGateway({
        orderId: payment.razorpayOrderId,
        paymentId: payment.razorpayPaymentId,
        expectedAmountPaise,
      });
      if (!gateway.ok) {
        return NextResponse.json({ error: gateway.error }, { status: 402 });
      }
      if (gateway.warning) {
        console.warn('Razorpay gateway verification warning:', gateway.warning);
      }
    }

    const { createRegistrationFromPayload } = await import('@/lib/registrations/create');
    const result = await createRegistrationFromPayload(body, {
      paymentStatus: payment.status,
      razorpayOrderId: payment.razorpayOrderId ?? null,
      razorpayPaymentId: payment.razorpayPaymentId ?? null,
      paymentOrder,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.duplicate ? { duplicate: true } : {}) },
        { status: result.status }
      );
    }

    const regData = result.registration;
    const paymentReference =
      payment.razorpayPaymentId ?? (regData.razorpay_payment_id as string | null) ?? null;
    const razorpayOrderId =
      payment.razorpayOrderId ?? (regData.razorpay_order_id as string | null) ?? null;

    if (payment.status === 'Paid' && paymentReference) {
      const amountPaise =
        paymentOrder?.amount_paise ?? Math.round((Number(trn.fee) || feeResolved.fee || 0) * 100);
      const { sendPaymentInvoice } = await import('@/lib/invoices/send-payment-invoice');
      void sendPaymentInvoice({
        tournamentName: trn.name,
        amountPaise,
        currency: paymentOrder?.currency || 'INR',
        paymentId: paymentReference,
        orderId: razorpayOrderId,
        teamName: typeof body.teamName === 'string' ? body.teamName : null,
        representative:
          typeof body.representative === 'string' ? body.representative : null,
        players: Array.isArray(body.players) ? body.players : [],
        recipientEmail:
          Array.isArray(body.players) && body.players[0]?.email
            ? String(body.players[0].email)
            : null,
      }).then((invoice) => {
        if (!invoice.sent && !invoice.skipped) {
          console.warn('[api/register] invoice email failed:', invoice.error);
        }
      });
    }

    return NextResponse.json({
      success: true,
      registration: regData,
      paymentReference,
      razorpayOrderId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process registration';
    console.error('Registration error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
