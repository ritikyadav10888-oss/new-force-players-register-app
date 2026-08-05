import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import {
  isTeamInvitePaid,
  resolveTeamInviteRosterLimits,
  teamInviteLivePath,
  teamInvitePayPath,
  teamInvitePlayerPath,
} from '@/lib/team-invites/token';
import { loadInvitePlayers, loadTeamInviteByToken } from '@/lib/team-invites/finalize';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ token: string }> };

/** Public: team invite details + roster summary. */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const db = getServiceSupabase();
    const invite = await loadTeamInviteByToken(db, token);

    if (!invite) {
      return NextResponse.json({ error: 'Team link not found' }, { status: 404 });
    }

    const { data: trn, error: trnErr } = await db
      .from('tournaments')
      .select(
        'id, name, slug, type, fee, min_players, max_players, theme, form_config, custom_fields, sport, sports_config, age_categories, status, banner_url, sponsors, description, rules, terms, venue, registration_deadline, organizer_name, organizer_phone'
      )
      .eq('id', invite.tournament_id)
      .single();

    if (trnErr || !trn) {
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
      description: trn.description || '',
      rules: trn.rules || '',
      terms: trn.terms || '',
      venue: trn.venue || '',
      registrationDeadline: trn.registration_deadline || null,
      organizerName: trn.organizer_name || '',
      organizerPhone: trn.organizer_phone || '',
      form_config: trn.form_config,
      custom_fields: trn.custom_fields,
      sports_config: trn.sports_config,
      age_categories: trn.age_categories,
    };

    const slug = trn.slug as string;
    const paid = isTeamInvitePaid(invite.payment_status);
    const { minPlayers, maxPlayers } = resolveTeamInviteRosterLimits({
      tournamentMin: trn.min_players,
      tournamentMax: trn.max_players,
      inviteMin: invite.min_players,
      inviteMax: invite.max_players,
    });
    let players: { id: string; name: string; photoUrl: string | null }[] = [];

    if (paid && invite.registration_id) {
      const { data: regPlayers } = await db
        .from('players')
        .select('id, name, photo_url')
        .eq('registration_id', invite.registration_id)
        .order('name', { ascending: true });
      players = (regPlayers || []).map((p) => ({
        id: p.id,
        name: p.name,
        photoUrl: p.photo_url || null,
      }));
    } else if (!paid) {
      const pending = await loadInvitePlayers(db, invite.id);
      players = pending.map((p) => ({
        id: p.id as string,
        name: p.name as string,
        photoUrl: (p.photo_url as string) || null,
      }));
    }

    return NextResponse.json({
      invite: {
        id: invite.id,
        token: invite.token,
        teamName: invite.team_name,
        representative: invite.representative,
        contact: invite.contact,
        teamLogoUrl: invite.team_logo_url,
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
