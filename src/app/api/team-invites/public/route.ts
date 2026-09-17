import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
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
import { isDataImageUrl } from '@/lib/registrations/create';
import { uploadDataImage, imageExtFromDataUrl } from '@/lib/firebase/upload';
import { parseAgeCategories, validatePlayerDobAgainstCategory } from '@/lib/age-categories';
import { parseCustomFields, validateCustomFieldAnswers } from '@/lib/custom-fields';

export const runtime = 'nodejs';

function jsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

/**
 * Public: representative starts a team invite from /register/[slug].
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

    const { rows: trnRows } = await query<{
      id: string;
      slug: string;
      type: string;
      min_players: number | null;
      max_players: number | null;
      status: string;
      age_categories: unknown;
      form_config: unknown;
      custom_fields: unknown;
      team_custom_fields: unknown;
    }>(
      `SELECT id, slug, type, min_players, max_players, status, age_categories,
              form_config, custom_fields, team_custom_fields
       FROM tournaments WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    const trn = trnRows[0];

    if (!trn) {
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

    const teamCustomErr = validateCustomFieldAnswers(
      parseCustomFields(trn.team_custom_fields),
      body.teamCustomValues && typeof body.teamCustomValues === 'object'
        ? (body.teamCustomValues as Record<string, string>)
        : {}
    );
    if (teamCustomErr) {
      return NextResponse.json({ error: teamCustomErr }, { status: 400 });
    }

    let teamLogoUrl: string | null = null;
    if (typeof body.teamLogoUrl === 'string' && body.teamLogoUrl.trim()) {
      teamLogoUrl = isDataImageUrl(body.teamLogoUrl)
        ? await uploadDataImage(
            body.teamLogoUrl,
            `team-invites/${token}/logo.${imageExtFromDataUrl(body.teamLogoUrl)}`
          )
        : body.teamLogoUrl.trim();
    }

    const insertSql = `
      INSERT INTO team_invites (
        tournament_id, token, team_name, representative, contact, team_logo_url,
        min_players, max_players, selected_sports, teams_by_sport, fee_breakdown,
        selected_age_category_id, team_custom_values, payment_status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::jsonb,'Pending'
      )
      RETURNING *`;

    const values = [
      trn.id,
      token,
      teamName,
      representative,
      contact,
      teamLogoUrl,
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

    let invite: Record<string, unknown>;
    try {
      const { rows } = await query(insertSql, values);
      invite = rows[0] as Record<string, unknown>;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') {
        token = generateTeamInviteToken(teamName);
        values[1] = token;
        const { rows } = await query(insertSql, values);
        invite = rows[0] as Record<string, unknown>;
      } else {
        throw error;
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
      const catCheck = validatePlayerDobAgainstCategory(
        typeof player.dob === 'string' ? player.dob : null,
        parseAgeCategories(trn.age_categories),
        invite.selected_age_category_id as string | null
      );
      if (!catCheck.ok) {
        return NextResponse.json(
          { error: catCheck.error, token: invite.token },
          { status: 400 }
        );
      }

      const customErr = validateCustomFieldAnswers(
        parseCustomFields(trn.custom_fields),
        player.customValues && typeof player.customValues === 'object'
          ? (player.customValues as Record<string, string>)
          : {}
      );
      if (customErr) {
        return NextResponse.json({ error: customErr, token: invite.token }, { status: 400 });
      }

      const inserted = await insertTeamInvitePlayer(
        invite.id as string,
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

    const s = trn.slug;
    return NextResponse.json(
      {
        success: true,
        token: invite.token,
        teamName: invite.team_name,
        minPlayers,
        maxPlayers,
        links: {
          player: teamInvitePlayerPath(s, invite.token as string),
          pay: teamInvitePayPath(s, invite.token as string),
          live: teamInviteLivePath(s, invite.token as string),
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
