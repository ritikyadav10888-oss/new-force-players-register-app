import { NextResponse } from 'next/server';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';
import {
  adminDeleteRegistrationPlayer,
  adminUpdateRegistrationPlayer,
  mapRegistrationPlayerForAdmin,
} from '@/lib/team-invites/admin-players';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ registrationId: string; playerId: string }> };

/** Superadmin: edit a player on a Team Link registration roster. */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { registrationId, playerId } = await ctx.params;
    const body = await request.json();
    const player = body?.player && typeof body.player === 'object' ? body.player : body;

    const result = await adminUpdateRegistrationPlayer(registrationId, playerId, player);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      player: mapRegistrationPlayerForAdmin(result.registrationPlayer),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update player';
    console.error(
      '[api/admin/registrations/[registrationId]/team-link-players/[playerId] PATCH]',
      message
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Superadmin: remove a player from a Team Link registration roster. */
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { registrationId, playerId } = await ctx.params;

    const result = await adminDeleteRegistrationPlayer(registrationId, playerId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, playerCount: result.playerCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete player';
    console.error(
      '[api/admin/registrations/[registrationId]/team-link-players/[playerId] DELETE]',
      message
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
