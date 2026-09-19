import { NextResponse } from 'next/server';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';
import {
  adminDeleteInvitePlayer,
  adminUpdateInvitePlayer,
  mapInvitePlayerForAdmin,
  mapRegistrationPlayerForAdmin,
} from '@/lib/team-invites/admin-players';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ inviteId: string; playerId: string }> };

/** Superadmin: update a Team Link invite player (syncs registration player when paid). */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { inviteId, playerId } = await ctx.params;
    const body = await request.json();
    const player = body?.player && typeof body.player === 'object' ? body.player : body;

    const result = await adminUpdateInvitePlayer(inviteId, playerId, player);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      invitePlayer: mapInvitePlayerForAdmin(result.invitePlayer),
      registrationPlayer: result.registrationPlayer
        ? mapRegistrationPlayerForAdmin(result.registrationPlayer)
        : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update player';
    console.error('[api/admin/team-invites/[inviteId]/players/[playerId] PATCH]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Superadmin: remove a Team Link invite player (also removes matching registration player). */
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { inviteId, playerId } = await ctx.params;

    const result = await adminDeleteInvitePlayer(inviteId, playerId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, playerCount: result.playerCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete player';
    console.error('[api/admin/team-invites/[inviteId]/players/[playerId] DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
