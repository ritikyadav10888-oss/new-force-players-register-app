import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import { loadTeamLinkInviteByRegistration } from '@/lib/team-invites/admin-players';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ registrationId: string }> };

/** Admin: update Team Link registration team meta (Society Name, etc.). */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { registrationId } = await ctx.params;
    const body = await request.json();
    const db = getServiceSupabase();

    const linked = await loadTeamLinkInviteByRegistration(db, registrationId);
    if (!linked.ok) {
      return NextResponse.json({ error: linked.error }, { status: linked.status });
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

    const { data, error } = await db
      .from('registrations')
      .update(update)
      .eq('id', registrationId)
      .select('id, team_name, representative, contact, team_custom_values')
      .single();
    if (error) throw error;

    const inviteUpdate: Record<string, unknown> = {};
    if (update.team_custom_values) inviteUpdate.team_custom_values = update.team_custom_values;
    if (update.team_name) inviteUpdate.team_name = update.team_name;
    if (update.representative) inviteUpdate.representative = update.representative;
    if (update.contact) inviteUpdate.contact = update.contact;
    if (Object.keys(inviteUpdate).length) {
      inviteUpdate.updated_at = new Date().toISOString();
      await db.from('team_invites').update(inviteUpdate).eq('id', linked.invite.id);
    }

    return NextResponse.json({ success: true, registration: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update team meta';
    console.error('[api/admin/registrations/[registrationId]/team-meta PATCH]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
