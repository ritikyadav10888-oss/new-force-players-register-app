import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { findDuplicatePlayerInTournament } from '@/lib/team-invites/duplicate-check';
import {
  appendPlayerToRegistration,
  insertTeamInvitePlayer,
} from '@/lib/team-invites/insert-player';
import { loadInvitePlayers, loadTeamInviteByToken } from '@/lib/team-invites/finalize';
import { isTeamInvitePaid, resolveTeamInviteRosterLimits } from '@/lib/team-invites/token';
import { parseAgeCategories, validatePlayerDobAgainstCategory } from '@/lib/age-categories';
import { parseCustomFields, validateCustomFieldAnswers } from '@/lib/custom-fields';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ token: string }> };

function isFutureDob(dobString: unknown): boolean {
  if (typeof dobString !== 'string' || !dobString) return false;
  const d = new Date(dobString);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  const dobDateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return dobDateOnly > todayDateOnly;
}

/**
 * Add a player to a team invite.
 * Pay-first flow:
 * - Unpaid: only the representative (first player) may register.
 * - Paid: other players join until max_players; also appended to the registration.
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const ip = getClientIp(request);
    const rateLimited = await enforceRateLimit(request, [
      { key: `team-invite-player:ip:${ip}`, max: 30, windowSeconds: 60 },
    ]);
    if (rateLimited) return rateLimited;

    const { token } = await ctx.params;
    const body = await request.json();
    const player = body?.player && typeof body.player === 'object' ? body.player : body;
    const asRepresentative = body?.asRepresentative === true;

    const invite = await loadTeamInviteByToken(token);

    if (!invite) {
      return NextResponse.json({ error: 'Team link not found' }, { status: 404 });
    }

    const paid = isTeamInvitePaid(invite.payment_status);
    const existing = await loadInvitePlayers(invite.id);

    const { rows: trnRows } = await query<{
      id: string;
      status: string;
      form_config: unknown;
      age_categories: unknown;
      min_players: number | null;
      max_players: number | null;
      custom_fields: unknown;
    }>(
      `SELECT id, status, form_config, age_categories, min_players, max_players, custom_fields
       FROM tournaments WHERE id = $1 LIMIT 1`,
      [invite.tournament_id]
    );
    const trn = trnRows[0];

    if (!trn || trn.status === 'Closed') {
      return NextResponse.json({ error: 'Registration is closed.' }, { status: 400 });
    }

    const { minPlayers, maxPlayers } = resolveTeamInviteRosterLimits({
      tournamentMin: trn.min_players,
      tournamentMax: trn.max_players,
      inviteMin: invite.min_players,
      inviteMax: invite.max_players,
    });

    if (!paid) {
      // Only representative self-register before payment
      if (existing.length >= 1 && !asRepresentative) {
        return NextResponse.json(
          {
            error:
              'Team payment is pending. Player registration opens after the representative pays.',
            paymentRequired: true,
          },
          { status: 403 }
        );
      }
      if (existing.length >= 1) {
        return NextResponse.json(
          {
            error: 'Representative is already on the roster. Complete payment to open player links.',
          },
          { status: 400 }
        );
      }
    } else {
      if (existing.length >= maxPlayers) {
        return NextResponse.json(
          {
            error: `Team roster is full (${maxPlayers} players max). Registration is closed for this team.`,
            teamFull: true,
            minPlayers,
            maxPlayers,
          },
          { status: 409 }
        );
      }
      if (!invite.registration_id) {
        return NextResponse.json(
          { error: 'Team payment is confirmed but registration is missing. Contact support.' },
          { status: 500 }
        );
      }
    }

    const name = typeof player.name === 'string' ? player.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Player name is required.' }, { status: 400 });
    }

    if (isFutureDob(player.dob)) {
      return NextResponse.json({ error: 'Date of birth cannot be in the future.' }, { status: 400 });
    }

    const catCheck = validatePlayerDobAgainstCategory(
      player.dob,
      parseAgeCategories(trn.age_categories),
      invite.selected_age_category_id
    );
    if (!catCheck.ok) {
      return NextResponse.json({ error: catCheck.error }, { status: 400 });
    }

    const customErr = validateCustomFieldAnswers(
      parseCustomFields(trn.custom_fields),
      player.customValues && typeof player.customValues === 'object'
        ? (player.customValues as Record<string, string>)
        : {}
    );
    if (customErr) {
      return NextResponse.json({ error: customErr }, { status: 400 });
    }

    const normName = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
    const normText = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const pPhone = normText(player.phone);
    const pName = normName(player.name);
    const pDob = normText(player.dob);
    if (pPhone && pName && pDob) {
      const onSameTeam = existing.find((p) => {
        return (
          normText(p.phone) === pPhone &&
          normName(p.name) === pName &&
          normText(p.dob) === pDob
        );
      });
      if (onSameTeam) {
        return NextResponse.json(
          { error: 'This player is already on this team roster.' },
          { status: 400 }
        );
      }
    }

    const dup = await findDuplicatePlayerInTournament(invite.tournament_id, player, {
      excludeInviteId: invite.id,
    });
    if (dup.duplicate) {
      return NextResponse.json(
        {
          duplicate: true,
          duplicatePlayerName: dup.name,
          duplicateTeamName: dup.teamName,
          error: dup.teamName
            ? `This player is already registered with team "${dup.teamName}".`
            : 'This player is already registered for this tournament.',
        },
        { status: 400 }
      );
    }

    const photoConfig = (trn.form_config as { photo?: { enabled?: boolean; required?: boolean } })
      ?.photo;
    const photo = typeof player.photo === 'string' ? player.photo.trim() : '';
    if (photoConfig?.enabled && photoConfig?.required && !photo) {
      return NextResponse.json({ error: 'A player photo is required.' }, { status: 400 });
    }

    const inserted = await insertTeamInvitePlayer(
      invite.id,
      player as Record<string, unknown>,
      trn.age_categories
    );

    if (inserted.ok === false) {
      return NextResponse.json({ error: inserted.error }, { status: 500 });
    }

    if (paid && invite.registration_id) {
      const appended = await appendPlayerToRegistration(
        invite.registration_id,
        inserted.player
      );
      if (appended.ok === false) {
        await query(`DELETE FROM team_invite_players WHERE id = $1`, [inserted.player.id]);
        return NextResponse.json({ error: appended.error }, { status: 500 });
      }
    }

    const updated = await loadInvitePlayers(invite.id);

    return NextResponse.json({
      success: true,
      player: inserted.player,
      playerCount: updated.length,
      seatsLeft: Math.max(0, maxPlayers - updated.length),
      minPlayers,
      maxPlayers,
      role: paid ? 'player' : 'representative',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add player';
    console.error('[api/team-invites/[token]/players POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
