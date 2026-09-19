import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';

function str(body: Record<string, unknown>, key: string, fallback = ''): string {
  const v = body[key];
  if (v == null) return fallback;
  return String(v).trim();
}

/** Global players list for admin All Players page. */
export async function GET(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { rows } = await query(
      `SELECT p.id, p.name, p.email, p.phone, p.emergency_contact, p.role, p.age,
              p.dob, p.gender, p.jersey_name, p.jersey_number, p.jersey_size,
              p.registration_id, p.tournament_id,
              r.team_name,
              t.id AS resolved_tournament_id, t.name AS tournament_name
       FROM players p
       LEFT JOIN registrations r ON r.id = p.registration_id
       LEFT JOIN tournaments t ON t.id = COALESCE(p.tournament_id, r.tournament_id)
       ORDER BY p.created_at DESC NULLS LAST, p.name ASC NULLS LAST`
    );

    const players = rows.map((p) => ({
      id: p.id,
      name: p.name || '',
      email: p.email || '',
      phone: p.phone || '',
      emergencyContact: p.emergency_contact || '',
      role: p.role || '',
      age: p.age || '',
      dob: p.dob || '',
      gender: p.gender || '',
      jerseyName: p.jersey_name || '',
      jerseyNumber: p.jersey_number || '',
      jerseySize: p.jersey_size || '',
      teamName: p.team_name || '-',
      tournamentName: p.tournament_name || 'Unknown Tournament',
      tournamentId: p.resolved_tournament_id || p.tournament_id || null,
      registrationId: p.registration_id || null,
      regId: p.registration_id || 'unknown',
    }));

    return NextResponse.json({ players });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load players';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Create a player under a tournament.
 * - With registrationId: append to that registration
 * - Without: create a new registration (teamName optional; defaults to player name)
 */
export async function POST(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tournamentId = str(body, 'tournamentId');
    const name = str(body, 'name');
    if (!tournamentId) {
      return NextResponse.json({ error: 'Tournament is required.' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Player name is required.' }, { status: 400 });
    }

    const { rows: tours } = await query(`SELECT id, type FROM tournaments WHERE id = $1 LIMIT 1`, [
      tournamentId,
    ]);
    if (!tours[0]) {
      return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 });
    }

    let registrationId = str(body, 'registrationId') || null;
    if (registrationId) {
      const { rows: regs } = await query(
        `SELECT id FROM registrations WHERE id = $1 AND tournament_id = $2 LIMIT 1`,
        [registrationId, tournamentId]
      );
      if (!regs[0]) {
        return NextResponse.json(
          { error: 'Registration not found for this tournament.' },
          { status: 404 }
        );
      }
    } else {
      const teamName = str(body, 'teamName') || name;
      const { rows: regs } = await query(
        `INSERT INTO registrations (tournament_id, team_name, representative, contact, payment_status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          tournamentId,
          teamName,
          str(body, 'representative') || name,
          str(body, 'phone') || str(body, 'contact') || null,
          str(body, 'paymentStatus') || 'Pending',
        ]
      );
      registrationId = regs[0].id as string;
    }

    const { rows } = await query(
      `INSERT INTO players (
         registration_id, tournament_id, name, email, phone, emergency_contact,
         dob, age, age_category, gender, aadhar, jersey_name, jersey_number, jersey_size,
         role, batting_hand, bowling_type, all_rounder_type, custom_values
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19::jsonb
       )
       RETURNING id`,
      [
        registrationId,
        tournamentId,
        name,
        str(body, 'email') || null,
        str(body, 'phone') || null,
        str(body, 'emergencyContact') || null,
        str(body, 'dob') || null,
        str(body, 'age') || null,
        str(body, 'ageCategory') || null,
        str(body, 'gender') || null,
        str(body, 'aadhar') || null,
        str(body, 'jerseyName') || null,
        str(body, 'jerseyNumber') || null,
        str(body, 'jerseySize') || null,
        str(body, 'role') || null,
        str(body, 'battingHand') || null,
        str(body, 'bowlingType') || null,
        str(body, 'allRounderType') || null,
        JSON.stringify(
          body.customValues && typeof body.customValues === 'object' ? body.customValues : {}
        ),
      ]
    );

    return NextResponse.json({ ok: true, playerId: rows[0].id, registrationId }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create player';
    console.error('[api/admin/players POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
