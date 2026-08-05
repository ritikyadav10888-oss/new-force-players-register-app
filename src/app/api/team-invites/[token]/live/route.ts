import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { loadInvitePlayers, loadTeamInviteByToken } from '@/lib/team-invites/finalize';
import {
  isTeamInvitePaid,
  resolveTeamInviteRosterLimits,
  teamInviteLivePath,
} from '@/lib/team-invites/token';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ token: string }> };

/** Public live roster for a team invite (pending roster or confirmed after payment). */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const db = getServiceSupabase();
    const invite = await loadTeamInviteByToken(db, token);

    if (!invite) {
      return NextResponse.json({ error: 'Team link not found' }, { status: 404 });
    }

    const { data: trn } = await db
      .from('tournaments')
      .select('id, name, slug, status, min_players, max_players')
      .eq('id', invite.tournament_id)
      .single();

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
      const { data: regPlayers } = await db
        .from('players')
        .select('name, photo_url')
        .eq('registration_id', invite.registration_id)
        .order('name', { ascending: true });
      players = (regPlayers || [])
        .filter((p) => p.name)
        .map((p) => ({
          name: String(p.name).trim(),
          photoUrl: p.photo_url || null,
        }));
    } else {
      const pending = await loadInvitePlayers(db, invite.id);
      players = pending
        .filter((p) => p.name)
        .map((p) => ({
          name: String(p.name).trim(),
          photoUrl: (p.photo_url as string) || null,
        }));
    }

    const slug = trn.slug as string;

    return NextResponse.json(
      {
        tournamentName: trn.name,
        teamName: invite.team_name,
        representative: invite.representative,
        paymentStatus: invite.payment_status,
        confirmed: paid,
        playerCount: players.length,
        maxPlayers,
        minPlayers,
        players,
        livePath: teamInviteLivePath(slug, invite.token),
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=10, stale-while-revalidate=20',
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load live roster';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
