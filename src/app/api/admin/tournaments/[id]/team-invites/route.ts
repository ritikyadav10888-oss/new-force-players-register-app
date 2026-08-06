import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
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
    const db = getServiceSupabase();

    const { data: trn } = await db
      .from('tournaments')
      .select('id, slug')
      .eq('id', id)
      .maybeSingle();

    if (!trn) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const { data: invites, error } = await db
      .from('team_invites')
      .select(
        'id, token, team_name, representative, contact, min_players, max_players, payment_status, registration_id, created_at, selected_sports, selected_age_category_id, team_custom_values'
      )
      .eq('tournament_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const inviteIds = (invites || []).map((i) => i.id);
    const counts: Record<string, number> = {};

    if (inviteIds.length) {
      const { data: rows } = await db
        .from('team_invite_players')
        .select('team_invite_id')
        .in('team_invite_id', inviteIds);
      for (const r of rows || []) {
        const tid = r.team_invite_id as string;
        counts[tid] = (counts[tid] || 0) + 1;
      }
    }

    const slug = trn.slug as string;

    return NextResponse.json(
      (invites || []).map((inv) => ({
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
