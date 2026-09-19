import { NextResponse } from 'next/server';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';
import {
  adminAddTeamLinkPlayer,
  loadTeamLinkInviteContext,
  mapInvitePlayerForAdmin,
} from '@/lib/team-invites/admin-players';
import { loadInvitePlayers } from '@/lib/team-invites/finalize';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ inviteId: string }> };

/** Admin: list players on a Team Link invite. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { inviteId } = await ctx.params;
    const loaded = await loadTeamLinkInviteContext(inviteId);
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }

    const players = await loadInvitePlayers(inviteId);
    return NextResponse.json({
      inviteId,
      teamName: loaded.invite.team_name,
      paymentStatus: loaded.invite.payment_status,
      registrationId: loaded.invite.registration_id,
      minPlayers: loaded.limits.minPlayers,
      maxPlayers: loaded.limits.maxPlayers,
      players: players.map((p) => mapInvitePlayerForAdmin(p as Record<string, unknown>)),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load players';
    console.error('[api/admin/team-invites/[inviteId]/players GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Admin: add a player to a Team Link invite (and registration if already paid). Superadmin only. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { inviteId } = await ctx.params;
    const body = await request.json();
    const player = body?.player && typeof body.player === 'object' ? body.player : body;

    const result = await adminAddTeamLinkPlayer(inviteId, player);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      invitePlayer: mapInvitePlayerForAdmin(result.invitePlayer),
      registrationPlayer: result.registrationPlayer
        ? {
            id: result.registrationPlayer.id,
            name: result.registrationPlayer.name,
            phone: result.registrationPlayer.phone,
            dob: result.registrationPlayer.dob,
            age: result.registrationPlayer.age,
            ageCategory: result.registrationPlayer.age_category,
            email: result.registrationPlayer.email,
            role: result.registrationPlayer.role,
            photo: result.registrationPlayer.photo_url,
            jerseyName: result.registrationPlayer.jersey_name,
            jerseyNumber: result.registrationPlayer.jersey_number,
            jerseySize: result.registrationPlayer.jersey_size,
            gender: result.registrationPlayer.gender,
            emergencyContact: result.registrationPlayer.emergency_contact,
          }
        : null,
      playerCount: result.playerCount,
      maxPlayers: result.maxPlayers,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add player';
    console.error('[api/admin/team-invites/[inviteId]/players POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
