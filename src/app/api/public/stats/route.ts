import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isTeamLikeTournamentType } from '@/lib/multi-sport';

/** Aggregated public stats (no PII). Cloud SQL only. */
export async function GET() {
  try {
    const [{ rows: tournaments }, { rows: registrations }] = await Promise.all([
      query<{
        id: string;
        status: string;
        fee: number | null;
        is_public: boolean | null;
        type: string;
      }>(`SELECT id, status, fee, is_public, type FROM tournaments`),
      query<{
        tournament_id: string;
        payment_status: string | null;
        player_count: number;
      }>(
        `SELECT r.tournament_id, r.payment_status, COUNT(p.id)::int AS player_count
         FROM registrations r
         LEFT JOIN players p ON p.registration_id = r.id
         GROUP BY r.id, r.tournament_id, r.payment_status`
      ),
    ]);

    const activeTournaments = tournaments.filter(
      (t) => t.status === 'Active' && t.is_public !== false
    );
    const publicActiveIds = new Set(activeTournaments.map((t) => t.id));
    const feeById = new Map(tournaments.map((t) => [t.id, Number(t.fee) || 0]));
    const typeById = new Map(tournaments.map((t) => [t.id, t.type]));

    let volume = 0;
    let players = 0;
    let teamRegs = 0;
    let individualRegs = 0;

    for (const r of registrations) {
      if (!publicActiveIds.has(r.tournament_id)) continue;
      if (isTeamLikeTournamentType(typeById.get(r.tournament_id))) teamRegs += 1;
      else individualRegs += 1;
      players += r.player_count || 0;
      if (r.payment_status === 'Paid') {
        volume += feeById.get(r.tournament_id) ?? 0;
      }
    }

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
