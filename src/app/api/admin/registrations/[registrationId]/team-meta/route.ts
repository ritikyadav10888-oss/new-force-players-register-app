import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import { loadTeamLinkInviteByRegistration } from '@/lib/team-invites/admin-players';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ registrationId: string }> };

function jsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

/** Admin: update Team Link registration team meta (Society Name, etc.). */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { registrationId } = await ctx.params;
    const body = await request.json();

    const linked = await loadTeamLinkInviteByRegistration(registrationId);
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

    const keys = Object.keys(update);
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const key of keys) {
      if (key === 'team_custom_values') {
        sets.push(`${key} = $${i}::jsonb`);
        vals.push(jsonb(update[key]));
      } else {
        sets.push(`${key} = $${i}`);
        vals.push(update[key]);
      }
      i += 1;
    }
    vals.push(registrationId);
    const { rows } = await query(
      `UPDATE registrations SET ${sets.join(', ')}
       WHERE id = $${i}
       RETURNING id, team_name, representative, contact, team_custom_values`,
      vals
    );
    const data = rows[0];

    const inviteUpdate: Record<string, unknown> = {};
    if (update.team_custom_values) inviteUpdate.team_custom_values = update.team_custom_values;
    if (update.team_name) inviteUpdate.team_name = update.team_name;
    if (update.representative) inviteUpdate.representative = update.representative;
    if (update.contact) inviteUpdate.contact = update.contact;
    if (Object.keys(inviteUpdate).length) {
      const ikeys = Object.keys(inviteUpdate);
      const isets: string[] = [];
      const ivals: unknown[] = [];
      let j = 1;
      for (const key of ikeys) {
        if (key === 'team_custom_values') {
          isets.push(`${key} = $${j}::jsonb`);
          ivals.push(jsonb(inviteUpdate[key]));
        } else {
          isets.push(`${key} = $${j}`);
          ivals.push(inviteUpdate[key]);
        }
        j += 1;
      }
      isets.push('updated_at = NOW()');
      ivals.push(linked.invite.id);
      await query(
        `UPDATE team_invites SET ${isets.join(', ')} WHERE id = $${j}`,
        ivals
      );
    }

    return NextResponse.json({ success: true, registration: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update team meta';
    console.error('[api/admin/registrations/[registrationId]/team-meta PATCH]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
