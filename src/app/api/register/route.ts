import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { resolvePaymentStatus } from '@/lib/payments/resolve-status';

export async function POST(request: Request) {
  try {
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
            const { data: reg } = await db
              .from('registrations')
              .select('team_name, representative, contact')
              .eq('id', match.registration_id)
              .single();

            const { data: roster } = await db
              .from('players')
              .select('name, email, phone, role')
              .eq('registration_id', match.registration_id)
              .order('created_at', { ascending: true });

            return NextResponse.json(
              {
                duplicate: true,
                registrationId: match.registration_id,
                duplicatePlayer: match,
                registration: reg || null,
                roster: roster || [],
                error:
                  'A player with this email or phone is already registered for this tournament.',
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
          team_logo_url: body.teamLogoUrl || null,
        },
      ])
      .select()
      .single();

    if (regError) throw regError;

    if (body.players && Array.isArray(body.players)) {
      const playersToInsert = body.players.map((p: Record<string, unknown>) => ({
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
        photo_url: p.photo || null,
        role: p.role || null,
        batting_hand: p.battingHand || null,
        bowling_type: p.bowlingType || null,
        all_rounder_type: p.allRounderType || null,
        custom_values: p.customValues || {},
      }));

      const { error: playersError } = await db.from('players').insert(playersToInsert);
      if (playersError) throw playersError;
    }

    return NextResponse.json({ success: true, registration: regData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process registration';
    console.error('Registration error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
