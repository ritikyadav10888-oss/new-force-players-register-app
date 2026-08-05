import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  generateTeamInviteToken,
  resolveTeamInviteRosterLimits,
  teamInviteLivePath,
  teamInvitePayPath,
  teamInvitePlayerPath,
} from '@/lib/team-invites/token';
import { isTeamInviteLinkType } from '@/lib/multi-sport';
import { insertTeamInvitePlayer } from '@/lib/team-invites/insert-player';

export const runtime = 'nodejs';

/**
 * Public: representative starts a team invite from /register/[slug].
 * Creates the invite (tournament min/max), optionally saves their own player details,
 * then returns pay / player / live links.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimited = await enforceRateLimit(request, [
      { key: `team-invite-public:ip:${ip}`, max: 12, windowSeconds: 60 },
    ]);
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const teamName = typeof body.teamName === 'string' ? body.teamName.trim() : '';
    const representative =
      typeof body.representative === 'string' ? body.representative.trim() : '';
    const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
    const player = body?.player && typeof body.player === 'object' ? body.player : null;

    if (!slug || !teamName || !representative || !contact) {
      return NextResponse.json(
        { error: 'Team name, representative name, and contact are required.' },
        { status: 400 }
      );
    }

    const db = getServiceSupabase();
    const { data: trn, error: trnErr } = await db
      .from('tournaments')
      .select('id, slug, type, min_players, max_players, status, age_categories, form_config')
      .eq('slug', slug)
      .maybeSingle();

    if (trnErr || !trn) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    if (trn.status === 'Closed' || trn.status === 'Draft') {
      return NextResponse.json({ error: 'Registration is closed.' }, { status: 400 });
    }

    if (!isTeamInviteLinkType(trn.type)) {
      return NextResponse.json(
        { error: 'This tournament does not use team invite links.' },
        { status: 400 }
      );
    }

    const { minPlayers, maxPlayers } = resolveTeamInviteRosterLimits({
      tournamentMin: trn.min_players,
      tournamentMax: trn.max_players,
    });

    let token = generateTeamInviteToken(teamName);
    const row = {
      tournament_id: trn.id,
      token,
      team_name: teamName,
      representative,
      contact,
      min_players: minPlayers,
      max_players: maxPlayers,
      selected_sports: Array.isArray(body.selectedSports) ? body.selectedSports : [],
      teams_by_sport:
        body.teamsBySport && typeof body.teamsBySport === 'object' ? body.teamsBySport : {},
      fee_breakdown: Array.isArray(body.feeBreakdown) ? body.feeBreakdown : [],
      selected_age_category_id:
        typeof body.selectedAgeCategoryId === 'string' ? body.selectedAgeCategoryId : null,
      payment_status: 'Pending',
    };

    let invite;
    {
      const { data, error } = await db.from('team_invites').insert([row]).select().single();
      if (error) {
        if (error.code === '23505') {
          token = generateTeamInviteToken(teamName);
          const retry = await db
            .from('team_invites')
            .insert([{ ...row, token }])
            .select()
            .single();
          if (retry.error) throw retry.error;
          invite = retry.data;
        } else {
          throw error;
        }
      } else {
        invite = data;
      }
    }

    if (player) {
      const name = typeof player.name === 'string' ? player.name.trim() : '';
      if (!name) {
        return NextResponse.json(
          {
            error: 'Your player name is required.',
            inviteId: invite.id,
            token: invite.token,
          },
          { status: 400 }
        );
      }
      const inserted = await insertTeamInvitePlayer(
        db,
        invite.id,
        player as Record<string, unknown>,
        trn.age_categories
      );
      if (inserted.ok === false) {
        return NextResponse.json(
          { error: inserted.error, token: invite.token },
          { status: 500 }
        );
      }
    }

    const s = trn.slug as string;
    return NextResponse.json(
      {
        success: true,
        token: invite.token,
        teamName: invite.team_name,
        minPlayers,
        maxPlayers,
        links: {
          player: teamInvitePlayerPath(s, invite.token),
          pay: teamInvitePayPath(s, invite.token),
          live: teamInviteLivePath(s, invite.token),
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to start team registration';
    console.error('[api/team-invites/public POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
