import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { buildTeamOccupancyFromRegs } from '@/lib/multi-sport';

type Ctx = { params: Promise<{ slug: string }> };

/** Public: how full each admin team is per team-sport (for max capacity UI). */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const db = getServiceSupabase();
    const { data: trn, error } = await db
      .from('tournaments')
      .select('id, status')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;
    if (!trn || trn.status === 'Draft') {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const { data: regs, error: rErr } = await db
      .from('registrations')
      .select('payment_status, teams_by_sport, players(id)')
      .eq('tournament_id', trn.id);

    if (rErr) throw rErr;

    const occupancy = buildTeamOccupancyFromRegs(regs || []);
    return NextResponse.json({ occupancy });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load capacity';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
