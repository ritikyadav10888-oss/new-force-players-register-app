import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import {
  adminDeleteRegistrationPlayer,
  adminUpdateRegistrationPlayer,
  mapRegistrationPlayerForAdmin,
} from '@/lib/team-invites/admin-players';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ registrationId: string; playerId: string }> };

/** Admin: edit a player on a Team Link registration roster. */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { registrationId, playerId } = await ctx.params;
    const body = await request.json();
    const player = body?.player && typeof body.player === 'object' ? body.player : body;
    const db = getServiceSupabase();

    const result = await adminUpdateRegistrationPlayer(db, registrationId, playerId, player);
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

/** Admin: remove a player from a Team Link registration roster. */
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { registrationId, playerId } = await ctx.params;
    const db = getServiceSupabase();

    const result = await adminDeleteRegistrationPlayer(db, registrationId, playerId);
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
