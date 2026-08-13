import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import { adminDeleteTeamInvite } from '@/lib/team-invites/admin-players';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ inviteId: string }> };

/**
 * Admin: delete an entire Team Link card.
 * Removes invite + invite players, and the paid registration (if any).
 */
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { inviteId } = await ctx.params;
    const db = getServiceSupabase();
    const result = await adminDeleteTeamInvite(db, inviteId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      teamName: result.teamName,
      deletedRegistration: result.deletedRegistration,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete team link';
    console.error('[api/admin/team-invites/[inviteId] DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Admin: update team invite meta (e.g. Society Name / team custom values). */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { inviteId } = await ctx.params;
    const body = await request.json();
    const db = getServiceSupabase();

    const { data: invite, error: loadErr } = await db
      .from('team_invites')
      .select('id, registration_id, tournament_id')
      .eq('id', inviteId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!invite) {
      return NextResponse.json({ error: 'Team link not found' }, { status: 404 });
    }

    const update: Record<string, unknown> = {};
    if (body?.teamCustomValues && typeof body.teamCustomValues === 'object') {
      update.team_custom_values = body.teamCustomValues;
    }
    if (typeof body?.teamName === 'string' && body.teamName.trim()) {
      update.team_name = body.teamName.trim();
    }
    if (typeof body?.representative === 'string') {
      update.representative = body.representative.trim();
    }
    if (typeof body?.contact === 'string') {
      update.contact = body.contact.trim();
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('team_invites')
      .update(update)
      .eq('id', inviteId)
      .select('id, team_name, representative, contact, team_custom_values, registration_id')
      .single();
    if (error) throw error;

    // Keep paid registration team fields in sync when present
    if (invite.registration_id && update.team_custom_values) {
      const regUpdate: Record<string, unknown> = {
        team_custom_values: update.team_custom_values,
      };
      if (typeof update.team_name === 'string') regUpdate.team_name = update.team_name;
      if (typeof update.representative === 'string') regUpdate.representative = update.representative;
      if (typeof update.contact === 'string') regUpdate.contact = update.contact;
      await db.from('registrations').update(regUpdate).eq('id', invite.registration_id);
    }

    return NextResponse.json({ success: true, invite: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update team link';
    console.error('[api/admin/team-invites/[inviteId] PATCH]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
