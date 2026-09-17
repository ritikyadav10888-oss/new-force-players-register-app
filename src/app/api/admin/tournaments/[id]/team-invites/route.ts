import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import {
  teamInviteLivePath,
  teamInvitePayPath,
  teamInvitePlayerPath,
} from '@/lib/team-invites/token';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** Admin: list team invites for a tournament. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { id } = await ctx.params;

    const { rows: trnRows } = await query<{ id: string; slug: string }>(
      `SELECT id, slug FROM tournaments WHERE id = $1 LIMIT 1`,
      [id]
    );
    const trn = trnRows[0];

    if (!trn) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const { rows: invites } = await query<{
      id: string;
      token: string;
      team_name: string;
      representative: string;
      contact: string;
      min_players: number;
      max_players: number;
      payment_status: string;
      registration_id: string | null;
      created_at: string;
      selected_sports: unknown;
      selected_age_category_id: string | null;
      team_custom_values: unknown;
    }>(
      `SELECT id, token, team_name, representative, contact, min_players, max_players,
              payment_status, registration_id, created_at, selected_sports,
              selected_age_category_id, team_custom_values
       FROM team_invites
       WHERE tournament_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    const inviteIds = invites.map((i) => i.id);
    const counts: Record<string, number> = {};

    if (inviteIds.length) {
      const { rows } = await query<{ team_invite_id: string }>(
        `SELECT team_invite_id FROM team_invite_players
         WHERE team_invite_id = ANY($1::uuid[])`,
        [inviteIds]
      );
      for (const r of rows) {
        counts[r.team_invite_id] = (counts[r.team_invite_id] || 0) + 1;
      }
    }

    const slug = trn.slug;

    return NextResponse.json(
      invites.map((inv) => ({
        ...inv,
        playerCount: counts[inv.id] || 0,
        links: {
          player: teamInvitePlayerPath(slug, inv.token),
          pay: teamInvitePayPath(slug, inv.token),
          live: teamInviteLivePath(slug, inv.token),
        },
      }))
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load team invites';
    console.error('[api/admin/tournaments/[id]/team-invites GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
