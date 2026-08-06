import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import {
  generateTeamInviteToken,
  resolveTeamInviteRosterLimits,
} from '@/lib/team-invites/token';

export const runtime = 'nodejs';

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

    const db = getServiceSupabase();
    const { data: trn, error: trnErr } = await db
      .from('tournaments')
      .select('id, slug, type, min_players, max_players, status')
      .eq('id', tournamentId)
      .single();

    if (trnErr || !trn) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    if (trn.status === 'Closed') {
      return NextResponse.json({ error: 'Registration is closed for this tournament.' }, { status: 400 });
    }

    // Always bound by tournament min/max — links cannot exceed tournament roster limits.
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

    const row = {
      tournament_id: tournamentId,
      token,
      team_name: teamName,
      representative,
      contact,
      team_logo_url: typeof body.teamLogoUrl === 'string' ? body.teamLogoUrl : null,
      min_players: minPlayers,
      max_players: maxPlayers,
      selected_sports: Array.isArray(body.selectedSports) ? body.selectedSports : [],
      teams_by_sport:
        body.teamsBySport && typeof body.teamsBySport === 'object' ? body.teamsBySport : {},
      fee_breakdown: Array.isArray(body.feeBreakdown) ? body.feeBreakdown : [],
      selected_age_category_id:
        typeof body.selectedAgeCategoryId === 'string' ? body.selectedAgeCategoryId : null,
      team_custom_values:
        body.teamCustomValues && typeof body.teamCustomValues === 'object'
          ? body.teamCustomValues
          : {},
      payment_status: 'Pending',
    };

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
        return NextResponse.json(
          { ...retry.data, slug: trn.slug },
          { status: 201 }
        );
      }
      throw error;
    }

    return NextResponse.json({ ...data, slug: trn.slug }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create team invite';
    console.error('[api/team-invites POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
