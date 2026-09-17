import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import {
  isTeamInvitePaid,
  resolveTeamInviteRosterLimits,
  teamInviteLivePath,
  teamInvitePayPath,
  teamInvitePlayerPath,
} from '@/lib/team-invites/token';
import { loadInvitePlayers, loadTeamInviteByToken } from '@/lib/team-invites/finalize';
import { resolveReadableUrls } from '@/lib/firebase/upload';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ token: string }> };

/** Public: team invite details + roster summary. */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const invite = await loadTeamInviteByToken(token);

    if (!invite) {
      return NextResponse.json({ error: 'Team link not found' }, { status: 404 });
    }

    const { rows: trnRows } = await query(
      `SELECT id, name, slug, type, fee, min_players, max_players, theme, form_config,
              custom_fields, sport, sports_config, age_categories, status, banner_url,
              sponsors, description, rules, terms, venue, registration_deadline,
              organizer_name, organizer_phone
       FROM tournaments WHERE id = $1 LIMIT 1`,
      [invite.tournament_id]
    );
    const trn = trnRows[0] as Record<string, unknown> | undefined;

    if (!trn) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    if (trn.status === 'Draft') {
      return NextResponse.json({ error: 'Team link not found' }, { status: 404 });
    }

    const tournament = {
      ...trn,
      minPlayers: trn.min_players,
      maxPlayers: trn.max_players,
      banner: trn.banner_url || null,
      banner_url: trn.banner_url,
      description: (trn.description as string) || '',
      rules: (trn.rules as string) || '',
      terms: (trn.terms as string) || '',
      venue: (trn.venue as string) || '',
      registrationDeadline: trn.registration_deadline || null,
      organizerName: (trn.organizer_name as string) || '',
      organizerPhone: (trn.organizer_phone as string) || '',
    };

    const slug = trn.slug as string;
    const paid = isTeamInvitePaid(invite.payment_status);
    const { minPlayers, maxPlayers } = resolveTeamInviteRosterLimits({
      tournamentMin: trn.min_players as number,
      tournamentMax: trn.max_players as number,
      inviteMin: invite.min_players,
      inviteMax: invite.max_players,
    });
    let players: { id: string; name: string; photoUrl: string | null }[] = [];

    if (paid && invite.registration_id) {
      const { rows: regPlayers } = await query<{
        id: string;
        name: string;
        photo_url: string | null;
      }>(
        `SELECT id, name, photo_url FROM players
         WHERE registration_id = $1 ORDER BY name ASC`,
        [invite.registration_id]
      );
      players = regPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        photoUrl: p.photo_url || null,
      }));
    } else if (!paid) {
      const pending = await loadInvitePlayers(invite.id);
      players = pending.map((p) => ({
        id: p.id as string,
        name: p.name as string,
        photoUrl: (p.photo_url as string) || null,
      }));
    }

    const urlMap = await resolveReadableUrls([
      ...players.map((p) => p.photoUrl),
      invite.team_logo_url as string | null,
    ]);
    players = players.map((p) => ({
      ...p,
      photoUrl: p.photoUrl ? urlMap.get(p.photoUrl) || p.photoUrl : null,
    }));
    const teamLogoUrl = invite.team_logo_url
      ? urlMap.get(invite.team_logo_url as string) || (invite.team_logo_url as string)
      : null;

    return NextResponse.json({
      invite: {
        id: invite.id,
        token: invite.token,
        teamName: invite.team_name,
        representative: invite.representative,
        contact: invite.contact,
        teamLogoUrl,
        minPlayers,
        maxPlayers,
        paymentStatus: invite.payment_status,
        playerCount: players.length,
        selectedSports: invite.selected_sports,
        teamsBySport: invite.teams_by_sport,
        selectedAgeCategoryId: invite.selected_age_category_id,
        registrationId: invite.registration_id,
      },
      tournament,
      players,
      links: {
        player: teamInvitePlayerPath(slug, invite.token),
        pay: teamInvitePayPath(slug, invite.token),
        live: teamInviteLivePath(slug, invite.token),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load team invite';
    console.error('[api/team-invites/[token] GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
