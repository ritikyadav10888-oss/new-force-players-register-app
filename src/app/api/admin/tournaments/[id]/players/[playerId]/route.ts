import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';

type Ctx = { params: Promise<{ id: string; playerId: string }> };

/**
 * Superadmin: remove one player from this tournament only.
 * Does not touch other tournaments, auth users, or payment refunds.
 * If the registration has no players left, deletes that registration row only.
 */
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { id: tournamentId, playerId } = await ctx.params;
    if (!tournamentId || !playerId) {
      return NextResponse.json({ error: 'Missing tournament or player id.' }, { status: 400 });
    }

    const { rows } = await query<{
      id: string;
      registration_id: string | null;
      tournament_id: string | null;
    }>(
      `SELECT p.id, p.registration_id, COALESCE(p.tournament_id, r.tournament_id) AS tournament_id
       FROM players p
       LEFT JOIN registrations r ON r.id = p.registration_id
       WHERE p.id = $1
       LIMIT 1`,
      [playerId]
    );
    const player = rows[0];
    if (!player) {
      return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    }
    if (player.tournament_id !== tournamentId) {
      return NextResponse.json(
        { error: 'Player does not belong to this tournament.' },
        { status: 404 }
      );
    }

    const registrationId = player.registration_id;

    await query(`DELETE FROM players WHERE id = $1`, [playerId]);

    let registrationDeleted = false;
    if (registrationId) {
      const { rows: countRows } = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM players WHERE registration_id = $1`,
        [registrationId]
      );
      if ((countRows[0]?.n || 0) === 0) {
        await query(`DELETE FROM registrations WHERE id = $1 AND tournament_id = $2`, [
          registrationId,
          tournamentId,
        ]);
        registrationDeleted = true;
      }
    }

    return NextResponse.json({
      ok: true,
      registrationDeleted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove player';
    console.error('[api/admin/tournaments/[id]/players/[playerId] DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
