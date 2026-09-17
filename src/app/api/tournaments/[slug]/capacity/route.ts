import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { buildTeamOccupancyFromRegs } from '@/lib/multi-sport';

type Ctx = { params: Promise<{ slug: string }> };

/** Public: how full each admin team is per team-sport (for max capacity UI). */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const { rows: tournaments } = await query<{ id: string; status: string }>(
      `SELECT id, status FROM tournaments WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    const trn = tournaments[0];
    if (!trn || trn.status === 'Draft') {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const { rows: regs } = await query<{
      payment_status: string | null;
      teams_by_sport: unknown;
      players: { id: string }[];
    }>(
      `SELECT r.payment_status, r.teams_by_sport,
              COALESCE(
                json_agg(json_build_object('id', p.id)) FILTER (WHERE p.id IS NOT NULL),
                '[]'
              ) AS players
       FROM registrations r
       LEFT JOIN players p ON p.registration_id = r.id
       WHERE r.tournament_id = $1
       GROUP BY r.id, r.payment_status, r.teams_by_sport`,
      [trn.id]
    );

    const occupancy = buildTeamOccupancyFromRegs(
      regs.map((r) => ({
        ...r,
        players: Array.isArray(r.players) ? r.players : [],
      }))
    );
    return NextResponse.json({ occupancy });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load capacity';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
