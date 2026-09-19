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
    const typeById = new Map(tournaments.map((t) => [t.id, t.type]));

    const { rows: volumeRows } = publicActiveIds.size
      ? await query<{ volume_paise: string }>(
          `SELECT COALESCE(SUM(
             COALESCE(
               (
                 SELECT po.amount_paise
                 FROM payment_orders po
                 WHERE po.registration_id = r.id
                    OR (
                      r.razorpay_order_id IS NOT NULL
                      AND po.razorpay_order_id = r.razorpay_order_id
                    )
                 ORDER BY po.paid_at DESC NULLS LAST, po.created_at DESC
                 LIMIT 1
               ),
               (
                 SELECT (COALESCE(SUM((elem->>'fee')::numeric), 0) * 100)::bigint
                 FROM jsonb_array_elements(
                   CASE
                     WHEN jsonb_typeof(COALESCE(r.fee_breakdown, '[]'::jsonb)) = 'array'
                     THEN COALESCE(r.fee_breakdown, '[]'::jsonb)
                     ELSE '[]'::jsonb
                   END
                 ) AS elem
                 WHERE (elem->>'fee') IS NOT NULL
               ),
               ((SELECT COALESCE(t.fee, 0) FROM tournaments t WHERE t.id = r.tournament_id) * 100)::bigint
             )
           ), 0)::text AS volume_paise
           FROM registrations r
           WHERE r.tournament_id = ANY($1::uuid[])
             AND lower(COALESCE(r.payment_status, '')) = 'paid'`,
          [[...publicActiveIds]]
        )
      : { rows: [{ volume_paise: '0' }] };

    let volume = Number(volumeRows[0]?.volume_paise || 0) / 100;
    let players = 0;
    let teamRegs = 0;
    let individualRegs = 0;

    for (const r of registrations) {
      if (!publicActiveIds.has(r.tournament_id)) continue;
      if (isTeamLikeTournamentType(typeById.get(r.tournament_id))) teamRegs += 1;
      else individualRegs += 1;
      players += r.player_count || 0;
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
