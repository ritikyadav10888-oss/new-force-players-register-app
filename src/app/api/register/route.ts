import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { resolvePaymentStatus } from '@/lib/payments/resolve-status';
import { validatePaymentOrder, type PaymentOrderRow } from '@/lib/payments/orders';
import { verifyRazorpayPaymentWithGateway } from '@/lib/razorpay/verify-payment';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { createRegistrationFromPayload } from '@/lib/registrations/create';

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
    const db = getServiceSupabase();

    const { data: trn, error: trnError } = await db
      .from('tournaments')
      .select('id, status, name, fee, form_config')
      .eq('id', body.tournamentId)
      .single();

    if (trnError || !trn) {
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

    const tournamentFee = Number(trn.fee) || 0;
    if (tournamentFee < 0) {
      return NextResponse.json({ error: 'Tournament fee cannot be negative.' }, { status: 400 });
    }

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
        const { data: regs, error: regsError } = await db
          .from('registrations')
          .select('id')
          .eq('tournament_id', body.tournamentId);

        if (regsError) throw regsError;

        if (regs && regs.length > 0) {
          const regIds = regs.map((r) => r.id);

          const { data: existingPlayers, error: playersError } = await db
            .from('players')
            .select('registration_id, email, phone, name, dob')
            .in('registration_id', regIds);

          if (playersError) throw playersError;

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

          const match = existingPlayers?.find((p) => {
            const phone = normText(p.phone);
            const name = normName(p.name);
            const dob = normText(p.dob);
            if (!phone || !name || !dob) return false;
            return incomingIdentities.has(identityKey(phone, name, dob));
          });

          if (match) {
            // Fetch team name + logo for the matched registration
            const { data: matchedReg } = await db
              .from('registrations')
              .select('team_name, team_logo_url')
              .eq('id', match.registration_id)
              .single();

            // Generate a short-lived signed URL for the logo if it's a storage path
            let duplicateTeamLogoUrl: string | null = null;
            if (matchedReg?.team_logo_url) {
              const rawLogo: string = matchedReg.team_logo_url;
              const markerIdx = rawLogo.indexOf('/uploads/');
              const storagePath = markerIdx !== -1 ? rawLogo.slice(markerIdx + '/uploads/'.length) : null;
              if (storagePath) {
                const { data: signed } = await db.storage
                  .from('uploads')
                  .createSignedUrl(storagePath, 60 * 60); // 1 hour
                duplicateTeamLogoUrl = signed?.signedUrl ?? rawLogo;
              } else {
                duplicateTeamLogoUrl = rawLogo;
              }
            }

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

      const validation = await validatePaymentOrder(db, {
        razorpayOrderId: payment.razorpayOrderId,
        tournamentId: body.tournamentId,
        expectedAmountPaise,
      });
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: validation.status });
      }
      paymentOrder = validation.order;

      // Single-use: reject a payment id already attached to a registration.
      const { data: existingReg } = await db
        .from('registrations')
        .select('id')
        .eq('razorpay_payment_id', payment.razorpayPaymentId)
        .maybeSingle();
      if (existingReg) {
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

    const result = await createRegistrationFromPayload(db, body, {
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
    return NextResponse.json({
      success: true,
      registration: regData,
      paymentReference: payment.razorpayPaymentId ?? regData.razorpay_payment_id ?? null,
      razorpayOrderId: payment.razorpayOrderId ?? regData.razorpay_order_id ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process registration';
    console.error('Registration error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
