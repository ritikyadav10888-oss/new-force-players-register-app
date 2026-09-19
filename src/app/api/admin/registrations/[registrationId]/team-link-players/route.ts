import { NextResponse } from 'next/server';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';
import {
  adminAddTeamLinkPlayer,
  loadTeamLinkInviteByRegistration,
  mapRegistrationPlayerForAdmin,
} from '@/lib/team-invites/admin-players';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ registrationId: string }> };

/** Superadmin: add a player to a paid Team Link registration roster. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { registrationId } = await ctx.params;
    const body = await request.json();
    const player = body?.player && typeof body.player === 'object' ? body.player : body;

    const ctxInvite = await loadTeamLinkInviteByRegistration(registrationId);
    if (!ctxInvite.ok) {
      return NextResponse.json({ error: ctxInvite.error }, { status: ctxInvite.status });
    }

    const result = await adminAddTeamLinkPlayer(ctxInvite.invite.id as string, player);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      player: result.registrationPlayer
        ? mapRegistrationPlayerForAdmin(result.registrationPlayer)
        : null,
      playerCount: result.playerCount,
      maxPlayers: result.maxPlayers,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add player';
    console.error('[api/admin/registrations/[registrationId]/team-link-players POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
