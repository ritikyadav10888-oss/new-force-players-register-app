import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import {
  generateTeamInviteToken,
  resolveTeamInviteRosterLimits,
} from '@/lib/team-invites/token';

export const runtime = 'nodejs';

function jsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

/** Admin: create a team invite with player / pay / live links. */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const body = await request.json();
    const tournamentId = typeof body.tournamentId === 'string' ? body.tournamentId.trim() : '';
    const teamName = typeof body.teamName === 'string' ? body.teamName.trim() : '';

    if (!tournamentId || !teamName) {
      return NextResponse.json(
        { error: 'tournamentId and teamName are required' },
        { status: 400 }
      );
    }

    const representative =
      typeof body.representative === 'string' ? body.representative.trim() : '';
    const contact = typeof body.contact === 'string' ? body.contact.trim() : '';

    if (!representative || !contact) {
      return NextResponse.json(
        { error: 'representative and contact are required' },
        { status: 400 }
      );
    }

    const { rows: trnRows } = await query<{
      id: string;
      slug: string;
      type: string;
      min_players: number | null;
      max_players: number | null;
      status: string;
    }>(
      `SELECT id, slug, type, min_players, max_players, status
       FROM tournaments WHERE id = $1 LIMIT 1`,
      [tournamentId]
    );
    const trn = trnRows[0];

    if (!trn) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    if (trn.status === 'Closed') {
      return NextResponse.json({ error: 'Registration is closed for this tournament.' }, { status: 400 });
    }

    const { minPlayers, maxPlayers } = resolveTeamInviteRosterLimits({
      tournamentMin: trn.min_players,
      tournamentMax: trn.max_players,
      inviteMin: body.minPlayers,
      inviteMax: body.maxPlayers,
    });

    let token =
      typeof body.token === 'string' && body.token.trim()
        ? body.token.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
        : generateTeamInviteToken(teamName);

    const values = [
      tournamentId,
      token,
      teamName,
      representative,
      contact,
      typeof body.teamLogoUrl === 'string' ? body.teamLogoUrl : null,
      minPlayers,
      maxPlayers,
      jsonb(Array.isArray(body.selectedSports) ? body.selectedSports : []),
      jsonb(body.teamsBySport && typeof body.teamsBySport === 'object' ? body.teamsBySport : {}),
      jsonb(Array.isArray(body.feeBreakdown) ? body.feeBreakdown : []),
      typeof body.selectedAgeCategoryId === 'string' ? body.selectedAgeCategoryId : null,
      jsonb(
        body.teamCustomValues && typeof body.teamCustomValues === 'object'
          ? body.teamCustomValues
          : {}
      ),
    ];

    const insertSql = `
      INSERT INTO team_invites (
        tournament_id, token, team_name, representative, contact, team_logo_url,
        min_players, max_players, selected_sports, teams_by_sport, fee_breakdown,
        selected_age_category_id, team_custom_values, payment_status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::jsonb,'Pending'
      )
      RETURNING *`;

    try {
      const { rows } = await query(insertSql, values);
      return NextResponse.json({ ...rows[0], slug: trn.slug }, { status: 201 });
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === '23505') {
        token = generateTeamInviteToken(teamName);
        values[1] = token;
        const { rows } = await query(insertSql, values);
        return NextResponse.json({ ...rows[0], slug: trn.slug }, { status: 201 });
      }
      throw error;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create team invite';
    console.error('[api/team-invites POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
