import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { resolvePaymentStatus } from '@/lib/payments/resolve-status';
import {
  consumePaymentOrder,
  validatePaymentOrder,
  type PaymentOrderRow,
} from '@/lib/payments/orders';
import { verifyRazorpayPaymentWithGateway } from '@/lib/razorpay/verify-payment';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';

function isDataImageUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/') && v.includes(';base64,');
}

function parseDataUrl(dataUrl: string): { mime: string; base64: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) throw new Error('Invalid image data URL.');
  return { mime: m[1], base64: m[2] };
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return 'jpg';
}

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

async function uploadImageDataUrl(
  db: ReturnType<typeof getServiceSupabase>,
  dataUrl: string,
  path: string
): Promise<string> {
  const { mime, base64 } = parseDataUrl(dataUrl);
  const bytes = Buffer.from(base64, 'base64');
  // Guard: keep uploads reasonably small (2.5MB decoded)
  if (bytes.length > 2_500_000) {
    throw new Error('Photo is too large. Please upload a smaller image.');
  }

  const { error } = await db.storage.from('uploads').upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw error;

  const { data } = db.storage.from('uploads').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Failed to generate photo URL.');
  return data.publicUrl;
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
      .select('id, status, name, fee')
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
            .select('registration_id, email, phone, name')
            .in('registration_id', regIds);

          if (playersError) throw playersError;

          const match = existingPlayers?.find(
            (p) =>
              (p.email && emails.includes(p.email)) ||
              (p.phone && phones.includes(p.phone))
          );

          if (match) {
            // Privacy: do NOT return any registrant PII (name/email/phone/roster/
            // registration id) to an unverified caller. Only confirm the duplicate.
            return NextResponse.json(
              {
                duplicate: true,
                error:
                  'A player with this email or phone is already registered for this tournament. Please contact the organizer if you need your registration details.',
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

    let teamLogoUrl: string | null = body.teamLogoUrl || null;
    if (isDataImageUrl(body.teamLogoUrl)) {
      const { mime } = parseDataUrl(body.teamLogoUrl);
      const ext = extForMime(mime);
      teamLogoUrl = await uploadImageDataUrl(
        db,
        body.teamLogoUrl,
        `teams/${String(body.tournamentId || 't')}/${Date.now()}.${ext}`
      );
    }

    const { data: regData, error: regError } = await db
      .from('registrations')
      .insert([
        {
          tournament_id: body.tournamentId,
          team_name: body.teamName,
          representative: body.representative,
          contact: body.contact,
          payment_status: payment.status,
          razorpay_order_id: payment.razorpayOrderId,
          razorpay_payment_id: payment.razorpayPaymentId,
          team_logo_url: teamLogoUrl,
        },
      ])
      .select()
      .single();

    if (regError) {
      // Unique violation on razorpay_payment_id = concurrent replay attempt.
      if ((regError as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'This payment has already been used to register.' },
          { status: 409 }
        );
      }
      throw regError;
    }

    if (paymentOrder) {
      await consumePaymentOrder(db, {
        id: paymentOrder.id,
        razorpayPaymentId: payment.razorpayPaymentId,
        registrationId: regData.id,
      });
    }

    if (body.players && Array.isArray(body.players)) {
      const playersToInsert = await Promise.all(
        body.players.map(async (p: Record<string, unknown>, idx: number) => {
          let photoUrl: string | null = (p.photo as string) || null;
          if (isDataImageUrl(p.photo)) {
            const { mime } = parseDataUrl(p.photo);
            const ext = extForMime(mime);
            photoUrl = await uploadImageDataUrl(
              db,
              p.photo,
              `players/${regData.id}/p${idx + 1}.${ext}`
            );
          }

          return {
            registration_id: regData.id,
            name: p.name,
            email: p.email || null,
            phone: p.phone || null,
            emergency_contact: p.emergencyContact || null,
            dob: p.dob || null,
            age: p.age != null ? String(p.age) : null,
            gender: p.gender || null,
            aadhar: p.aadhar || null,
            jersey_name: p.jerseyName || null,
            jersey_number: p.jerseyNumber != null ? String(p.jerseyNumber) : null,
            jersey_size: p.jerseySize || null,
            photo_url: photoUrl,
            role: p.role || null,
            batting_hand: p.battingHand || null,
            bowling_type: p.bowlingType || null,
            all_rounder_type: p.allRounderType || null,
            custom_values: p.customValues || {},
          };
        })
      );

      const { error: playersError } = await db.from('players').insert(playersToInsert);
      if (playersError) throw playersError;
    }

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
