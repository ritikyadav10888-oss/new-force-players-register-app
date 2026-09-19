import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';

type Ctx = { params: Promise<{ playerId: string }> };

const PLAYER_SELECT = `
  SELECT p.id, p.registration_id, p.tournament_id, p.name, p.email, p.phone,
         p.emergency_contact, p.dob, p.age, p.age_category, p.gender, p.aadhar,
         p.jersey_name, p.jersey_number, p.jersey_size, p.photo_url, p.role,
         p.batting_hand, p.bowling_type, p.all_rounder_type, p.sport_profiles,
         p.custom_values, p.created_at,
         r.team_name, r.tournament_id AS reg_tournament_id,
         t.id AS resolved_tournament_id, t.name AS tournament_name, t.slug AS tournament_slug
  FROM players p
  LEFT JOIN registrations r ON r.id = p.registration_id
  LEFT JOIN tournaments t ON t.id = COALESCE(p.tournament_id, r.tournament_id)
`;

function mapPlayer(row: Record<string, unknown>) {
  return {
    id: row.id,
    registrationId: row.registration_id || null,
    tournamentId: row.resolved_tournament_id || row.tournament_id || row.reg_tournament_id || null,
    tournamentName: row.tournament_name || 'Unknown Tournament',
    tournamentSlug: row.tournament_slug || null,
    teamName: row.team_name || '-',
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    emergencyContact: row.emergency_contact || '',
    dob: row.dob || '',
    age: row.age || '',
    ageCategory: row.age_category || '',
    gender: row.gender || '',
    aadhar: row.aadhar || '',
    jerseyName: row.jersey_name || '',
    jerseyNumber: row.jersey_number || '',
    jerseySize: row.jersey_size || '',
    photo: row.photo_url || '',
    role: row.role || '',
    battingHand: row.batting_hand || '',
    bowlingType: row.bowling_type || '',
    allRounderType: row.all_rounder_type || '',
    sportProfiles: row.sport_profiles || {},
    customValues: row.custom_values || {},
    createdAt: row.created_at || null,
  };
}

function str(body: Record<string, unknown>, key: string): string | null {
  if (!(key in body)) return null;
  const v = body[key];
  if (v == null) return '';
  return String(v).trim();
}

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { playerId } = await ctx.params;
    const { rows } = await query(`${PLAYER_SELECT} WHERE p.id = $1 LIMIT 1`, [playerId]);
    if (!rows[0]) {
      return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    }
    return NextResponse.json({ player: mapPlayer(rows[0] as Record<string, unknown>) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load player';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { playerId } = await ctx.params;
    const body = (await request.json()) as Record<string, unknown>;

    const name = str(body, 'name');
    if (name !== null && !name) {
      return NextResponse.json({ error: 'Player name is required.' }, { status: 400 });
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    const fields: [string, string][] = [
      ['name', 'name'],
      ['email', 'email'],
      ['phone', 'phone'],
      ['emergencyContact', 'emergency_contact'],
      ['dob', 'dob'],
      ['age', 'age'],
      ['ageCategory', 'age_category'],
      ['gender', 'gender'],
      ['aadhar', 'aadhar'],
      ['jerseyName', 'jersey_name'],
      ['jerseyNumber', 'jersey_number'],
      ['jerseySize', 'jersey_size'],
      ['role', 'role'],
      ['battingHand', 'batting_hand'],
      ['bowlingType', 'bowling_type'],
      ['allRounderType', 'all_rounder_type'],
    ];

    for (const [jsKey, col] of fields) {
      const v = str(body, jsKey);
      if (v === null) continue;
      sets.push(`${col} = $${i++}`);
      vals.push(v || null);
    }

    if (body.customValues != null && typeof body.customValues === 'object') {
      sets.push(`custom_values = $${i++}::jsonb`);
      vals.push(JSON.stringify(body.customValues));
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    vals.push(playerId);
    const { rows } = await query(
      `UPDATE players SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`,
      vals
    );
    if (!rows[0]) {
      return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    }

    const { rows: full } = await query(`${PLAYER_SELECT} WHERE p.id = $1 LIMIT 1`, [playerId]);
    return NextResponse.json({ ok: true, player: mapPlayer(full[0] as Record<string, unknown>) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update player';
    console.error('[api/admin/players/[playerId] PATCH]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { playerId } = await ctx.params;
    const { rows } = await query<{ id: string; registration_id: string | null }>(
      `SELECT id, registration_id FROM players WHERE id = $1 LIMIT 1`,
      [playerId]
    );
    const player = rows[0];
    if (!player) {
      return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    }

    await query(`DELETE FROM players WHERE id = $1`, [playerId]);

    let registrationDeleted = false;
    if (player.registration_id) {
      const { rows: countRows } = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM players WHERE registration_id = $1`,
        [player.registration_id]
      );
      if ((countRows[0]?.n || 0) === 0) {
        await query(`DELETE FROM registrations WHERE id = $1`, [player.registration_id]);
        registrationDeleted = true;
      }
    }

    return NextResponse.json({ ok: true, registrationDeleted });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete player';
    console.error('[api/admin/players/[playerId] DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
