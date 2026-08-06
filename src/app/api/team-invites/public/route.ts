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
import { isDataImageUrl } from '@/lib/registrations/create';
import { parseAgeCategories, validatePlayerDobAgainstCategory } from '@/lib/age-categories';

export const runtime = 'nodejs';

function parseDataUrl(dataUrl: string): { mime: string; base64: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) throw new Error('Invalid image data URL.');
  return { mime: m[1], base64: m[2] };
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return 'jpg';
}

async function uploadTeamLogo(
  db: ReturnType<typeof getServiceSupabase>,
  dataUrl: string,
  token: string
): Promise<string> {
  const { mime, base64 } = parseDataUrl(dataUrl);
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 2_500_000) {
    throw new Error('Team logo is too large. Please upload a smaller image.');
  }
  const ext = extForMime(mime);
  const path = `team-invites/${token}/logo.${ext}`;
  const { error } = await db.storage.from('uploads').upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw error;
  const { data, error: signError } = await db.storage
    .from('uploads')
    .createSignedUrl(path, 120 * 24 * 60 * 60);
  if (signError || !data?.signedUrl) {
    throw signError || new Error('Failed to generate logo URL.');
  }
  return data.signedUrl;
}

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

    let teamLogoUrl: string | null = null;
    if (typeof body.teamLogoUrl === 'string' && body.teamLogoUrl.trim()) {
      teamLogoUrl = isDataImageUrl(body.teamLogoUrl)
        ? await uploadTeamLogo(db, body.teamLogoUrl, token)
        : body.teamLogoUrl.trim();
    }

    const row = {
      tournament_id: trn.id,
      token,
      team_name: teamName,
      representative,
      contact,
      team_logo_url: teamLogoUrl,
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
      const catCheck = validatePlayerDobAgainstCategory(
        typeof player.dob === 'string' ? player.dob : null,
        parseAgeCategories(trn.age_categories),
        invite.selected_age_category_id
      );
      if (!catCheck.ok) {
        return NextResponse.json(
          { error: catCheck.error, token: invite.token },
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
