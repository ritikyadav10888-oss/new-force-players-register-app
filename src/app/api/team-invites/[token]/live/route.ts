import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { loadInvitePlayers, loadTeamInviteByToken } from '@/lib/team-invites/finalize';
import {
  isTeamInvitePaid,
  resolveTeamInviteRosterLimits,
  teamInviteLivePath,
} from '@/lib/team-invites/token';
import { resolveReadableUrls } from '@/lib/firebase/upload';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ token: string }> };

/** Public live roster for a team invite. */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const invite = await loadTeamInviteByToken(token);

    if (!invite) {
      return NextResponse.json({ error: 'Team link not found' }, { status: 404 });
    }

    const { rows: trnRows } = await query<{
      id: string;
      name: string;
      slug: string;
      status: string;
      min_players: number | null;
      max_players: number | null;
    }>(
      `SELECT id, name, slug, status, min_players, max_players
       FROM tournaments WHERE id = $1 LIMIT 1`,
      [invite.tournament_id]
    );
    const trn = trnRows[0];

    if (!trn || trn.status === 'Draft') {
      return NextResponse.json({ error: 'Team link not found' }, { status: 404 });
    }

    const paid = isTeamInvitePaid(invite.payment_status);
    const { minPlayers, maxPlayers } = resolveTeamInviteRosterLimits({
      tournamentMin: trn.min_players,
      tournamentMax: trn.max_players,
      inviteMin: invite.min_players,
      inviteMax: invite.max_players,
    });
    let players: { name: string; photoUrl: string | null }[] = [];

    if (paid && invite.registration_id) {
      const { rows: regPlayers } = await query<{ name: string; photo_url: string | null }>(
        `SELECT name, photo_url FROM players
         WHERE registration_id = $1 ORDER BY name ASC`,
        [invite.registration_id]
      );
      players = regPlayers.map((p) => ({
        name: p.name,
        photoUrl: p.photo_url || null,
      }));
    } else {
      const pending = await loadInvitePlayers(invite.id);
      players = pending.map((p) => ({
        name: p.name as string,
        photoUrl: (p.photo_url as string) || null,
      }));
    }

    const urlMap = await resolveReadableUrls(players.map((p) => p.photoUrl));
    players = players.map((p) => ({
      ...p,
      photoUrl: p.photoUrl ? urlMap.get(p.photoUrl) || p.photoUrl : null,
    }));

    return NextResponse.json({
      teamName: invite.team_name,
      paymentStatus: invite.payment_status,
      paid,
      playerCount: players.length,
      minPlayers,
      maxPlayers,
      seatsLeft: Math.max(0, maxPlayers - players.length),
      tournamentName: trn.name,
      slug: trn.slug,
      livePath: teamInviteLivePath(trn.slug, invite.token),
      players,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load live roster';
    console.error('[team-invites live]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
