import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import {
  isAdminContext,
  requireAdmin,
  unauthorizedResponse,
  type AdminContext,
} from '@/lib/auth/admin';

type Ctx = { params: Promise<{ id: string }> };

async function loadTournament(auth: AdminContext, tournamentId: string) {
  const { rows } = await query<{ id: string; name: string; owner_id: string | null; auction_teams: unknown }>(
    `SELECT id, name, owner_id, auction_teams FROM tournaments WHERE id = $1 LIMIT 1`,
    [tournamentId]
  );
  const tournament = rows[0];
  if (!tournament) return { error: NextResponse.json({ error: 'Tournament not found' }, { status: 404 }) };
  if (auth.role === 'customer' && tournament.owner_id !== auth.userId) {
    return { error: unauthorizedResponse('forbidden') };
  }
  return { tournament };
}

function teamList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => String(t ?? '').trim()).filter(Boolean);
}

/** Auction teams + every player registered for the tournament with their sale (if sold). */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { id } = await ctx.params;
    const loaded = await loadTournament(auth, id);
    if ('error' in loaded) return loaded.error;

    const { rows: players } = await query<{
      id: string;
      name: string | null;
      photo_url: string | null;
      auction_team: string | null;
      auction_price: number | null;
    }>(
      `SELECT p.id, p.name, p.phone, p.email, p.dob, p.gender, p.role, p.age_category,
              p.batting_hand, p.bowling_type, p.all_rounder_type,
              p.jersey_name, p.jersey_number, p.jersey_size, p.custom_values, p.photo_url,
              p.auction_team, p.auction_price
       FROM players p
       JOIN registrations r ON r.id = p.registration_id
       WHERE r.tournament_id = $1
         AND COALESCE(trim(p.name), '') <> ''
       ORDER BY lower(p.name)`,
      [id]
    );

    const { resolveReadableUrls } = await import('@/lib/firebase/upload');
    const photos = await resolveReadableUrls(players.map((p) => p.photo_url)).catch(
      () => new Map<string, string>()
    );

    return NextResponse.json({
      tournament: { id: loaded.tournament.id, name: loaded.tournament.name },
      teams: teamList(loaded.tournament.auction_teams),
      players: players.map((p) => ({
        ...p,
        photo_url: p.photo_url ? photos.get(p.photo_url.trim()) || null : null,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load auction';
    console.error('[api/admin/tournaments/[id]/auction GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Save the team names. Teams are matched by position, so renaming team 3 moves its
 * bought players to the new name; players of a removed team go back to the pool.
 */
export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { id } = await ctx.params;
    const loaded = await loadTournament(auth, id);
    if ('error' in loaded) return loaded.error;

    const body = (await request.json()) as { teams?: unknown };
    const teams = teamList(body.teams);
    if (new Set(teams.map((t) => t.toLowerCase())).size !== teams.length) {
      return NextResponse.json({ error: 'Each team needs a different name.' }, { status: 400 });
    }

    const oldTeams = teamList(loaded.tournament.auction_teams);
    const playerScope = `registration_id IN (SELECT id FROM registrations WHERE tournament_id = $1)`;
    for (let i = 0; i < oldTeams.length; i++) {
      if (i >= teams.length) {
        await query(
          `UPDATE players SET auction_team = NULL, auction_price = NULL
           WHERE auction_team = $2 AND ${playerScope}`,
          [id, oldTeams[i]]
        );
      } else if (teams[i] !== oldTeams[i]) {
        await query(
          `UPDATE players SET auction_team = $3 WHERE auction_team = $2 AND ${playerScope}`,
          [id, oldTeams[i], teams[i]]
        );
      }
    }

    await query(`UPDATE tournaments SET auction_teams = $2::jsonb WHERE id = $1`, [
      id,
      JSON.stringify(teams),
    ]);
    return NextResponse.json({ ok: true, teams });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save teams';
    console.error('[api/admin/tournaments/[id]/auction PUT]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Sell a player to a team at a price, or send them back to the pool (team: null). */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { id } = await ctx.params;
    const loaded = await loadTournament(auth, id);
    if ('error' in loaded) return loaded.error;

    const body = (await request.json()) as { playerId?: unknown; team?: unknown; price?: unknown };
    const playerId = typeof body.playerId === 'string' ? body.playerId : '';
    const team = typeof body.team === 'string' ? body.team.trim() : '';
    const price = Math.round(Number(body.price));

    if (team) {
      if (!teamList(loaded.tournament.auction_teams).includes(team)) {
        return NextResponse.json({ error: 'Pick one of the auction teams.' }, { status: 400 });
      }
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: 'Enter a valid price.' }, { status: 400 });
      }
    }

    const { rowCount } = await query(
      `UPDATE players SET auction_team = $3, auction_price = $4
       WHERE id = $2
         AND registration_id IN (SELECT id FROM registrations WHERE tournament_id = $1)`,
      [id, playerId, team || null, team ? price : null]
    );
    if (!rowCount) {
      return NextResponse.json({ error: 'Player not found in this tournament.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save sale';
    console.error('[api/admin/tournaments/[id]/auction POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
