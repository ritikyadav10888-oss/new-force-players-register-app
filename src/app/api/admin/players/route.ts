import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';

/** Global players list for admin export page. */
export async function GET(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { rows } = await query(
      `SELECT p.name, p.phone, p.emergency_contact, p.role, p.age,
              r.id AS registration_id, r.team_name,
              t.name AS tournament_name
       FROM players p
       LEFT JOIN registrations r ON r.id = p.registration_id
       LEFT JOIN tournaments t ON t.id = COALESCE(p.tournament_id, r.tournament_id)
       ORDER BY p.name ASC NULLS LAST`
    );

    const players = rows.map((p) => ({
      name: p.name,
      phone: p.phone || p.emergency_contact || '-',
      teamName: p.team_name || '-',
      tournamentName: p.tournament_name || 'Unknown Tournament',
      role: p.role || '-',
      age: p.age || '-',
      regId: p.registration_id || 'unknown',
    }));

    return NextResponse.json({ players });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load players';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
