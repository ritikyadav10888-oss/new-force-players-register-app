import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import { adminDeleteTeamInvite } from '@/lib/team-invites/admin-players';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ inviteId: string }> };

function jsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

/**
 * Admin: delete an entire Team Link card.
 */
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { inviteId } = await ctx.params;
    const result = await adminDeleteTeamInvite(inviteId);
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

/** Admin: update team invite meta. */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { inviteId } = await ctx.params;
    const body = await request.json();

    const { rows: inviteRows } = await query<{
      id: string;
      registration_id: string | null;
      tournament_id: string;
    }>(
      `SELECT id, registration_id, tournament_id FROM team_invites WHERE id = $1 LIMIT 1`,
      [inviteId]
    );
    const invite = inviteRows[0];
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
    sets.push('updated_at = NOW()');
    vals.push(inviteId);

    const { rows } = await query(
      `UPDATE team_invites SET ${sets.join(', ')}
       WHERE id = $${i}
       RETURNING id, team_name, representative, contact, team_custom_values, registration_id`,
      vals
    );
    const data = rows[0];

    if (invite.registration_id && update.team_custom_values) {
      const regSets: string[] = ['team_custom_values = $1::jsonb'];
      const regVals: unknown[] = [jsonb(update.team_custom_values)];
      let ri = 2;
      if (typeof update.team_name === 'string') {
        regSets.push(`team_name = $${ri++}`);
        regVals.push(update.team_name);
      }
      if (typeof update.representative === 'string') {
        regSets.push(`representative = $${ri++}`);
        regVals.push(update.representative);
      }
      if (typeof update.contact === 'string') {
        regSets.push(`contact = $${ri++}`);
        regVals.push(update.contact);
      }
      regVals.push(invite.registration_id);
      await query(
        `UPDATE registrations SET ${regSets.join(', ')} WHERE id = $${ri}`,
        regVals
      );
    }

    return NextResponse.json({ success: true, invite: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update team link';
    console.error('[api/admin/team-invites/[inviteId] PATCH]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
