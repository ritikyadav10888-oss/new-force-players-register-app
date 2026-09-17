import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import {
  isAdminContext,
  requireAdmin,
  unauthorizedResponse,
  type AdminContext,
} from '@/lib/auth/admin';

async function assertTournamentAccess(auth: AdminContext, tournamentId: string) {
  const { rows } = await query<{ id: string; owner_id: string | null; slug: string }>(
    `SELECT id, owner_id, slug FROM tournaments WHERE id = $1 LIMIT 1`,
    [tournamentId]
  );
  const tournament = rows[0];
  if (!tournament) return { error: NextResponse.json({ error: 'Tournament not found' }, { status: 404 }) };
  if (auth.role === 'customer' && tournament.owner_id !== auth.userId) {
    return { error: unauthorizedResponse('forbidden') };
  }
  return { tournament };
}

/** Tournament detail + registrations/players + invite links for admin UI. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { id } = await params;
    const access = await assertTournamentAccess(auth, id);
    if ('error' in access && access.error) return access.error;
    const tournament = (await query(`SELECT * FROM tournaments WHERE id = $1`, [id])).rows[0];

    const { rows: regs } = await query(
      `SELECT * FROM registrations WHERE tournament_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    const regIds = regs.map((r) => r.id as string);
    const { rows: players } = regIds.length
      ? await query(`SELECT * FROM players WHERE registration_id = ANY($1::uuid[])`, [regIds])
      : { rows: [] };
    const { rows: invites } = regIds.length
      ? await query(
          `SELECT id, registration_id, token FROM team_invites WHERE registration_id = ANY($1::uuid[])`,
          [regIds]
        )
      : { rows: [] };

    const playersByReg = new Map<string, typeof players>();
    for (const p of players) {
      const rid = p.registration_id as string;
      const list = playersByReg.get(rid) || [];
      list.push(p);
      playersByReg.set(rid, list);
    }

    const registrations = regs.map((r) => ({
      ...r,
      players: playersByReg.get(r.id as string) || [],
    }));

    return NextResponse.json({
      tournament,
      registrations,
      invites,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load registrations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
