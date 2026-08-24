import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { isTeamLikeTournamentType } from '@/lib/multi-sport';

/** Aggregated public stats (no PII). Uses service role server-side only. */
export async function GET() {
  try {
    const db = getServiceSupabase();

    const [{ data: tournaments }, { data: registrations }] = await Promise.all([
      db.from('tournaments').select('id, status, fee, is_public, type'),
      db.from('registrations').select('tournament_id, payment_status, players(id)'),
    ]);

    const activeTournaments = (tournaments || []).filter(
      (t) => t.status === 'Active' && t.is_public !== false
    );
    const publicActiveIds = new Set(activeTournaments.map((t) => t.id));
    const feeById = new Map((tournaments || []).map((t) => [t.id, Number(t.fee) || 0]));
    const typeById = new Map((tournaments || []).map((t) => [t.id, t.type]));

    let volume = 0;
    let players = 0;
    let teamRegs = 0;
    let individualRegs = 0;

    (registrations || []).forEach((r) => {
      if (!publicActiveIds.has(r.tournament_id)) return;
      if (isTeamLikeTournamentType(typeById.get(r.tournament_id))) teamRegs += 1;
      else individualRegs += 1;
      const roster = r.players as { id: string }[] | null;
      players += Array.isArray(roster) ? roster.length : 0;
      if (r.payment_status === 'Paid') {
        volume += feeById.get(r.tournament_id) ?? 0;
      }
    });

    return NextResponse.json({
      total: activeTournaments.length,
      regs: teamRegs,
      individualRegs,
      players,
      volume,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load stats';
    console.error('Public stats error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
