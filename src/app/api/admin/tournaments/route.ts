import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';

function jsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

/** List tournaments for the signed-in admin (all for superadmin; owned for customer). */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { rows: tournaments } =
      auth.role === 'customer'
        ? await query(`SELECT * FROM tournaments WHERE owner_id = $1 ORDER BY created_at DESC`, [
            auth.userId,
          ])
        : await query(`SELECT * FROM tournaments ORDER BY created_at DESC`);

    const tournamentIds = tournaments.map((t) => t.id as string);
    const { rows: registrations } = tournamentIds.length
      ? await query<{
          id: string;
          tournament_id: string;
          payment_status: string | null;
          player_count: string;
        }>(
          `SELECT r.id, r.tournament_id, r.payment_status,
                  (SELECT COUNT(*)::text FROM players p WHERE p.registration_id = r.id) AS player_count
           FROM registrations r
           WHERE r.tournament_id = ANY($1::uuid[])`,
          [tournamentIds]
        )
      : { rows: [] };

    /** Actual rupees collected per tournament (from Razorpay ledger / fee_breakdown). */
    const volumeByTournament = new Map<string, number>();
    if (tournamentIds.length) {
      const { rows: volumeRows } = await query<{
        tournament_id: string;
        volume_paise: string;
      }>(
        `SELECT r.tournament_id,
                COALESCE(SUM(
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
           AND lower(COALESCE(r.payment_status, '')) = 'paid'
         GROUP BY r.tournament_id`,
        [tournamentIds]
      );
      for (const row of volumeRows) {
        volumeByTournament.set(row.tournament_id, Number(row.volume_paise || 0) / 100);
      }
    }

    const stats: Record<
      string,
      { regs: number; players: number; paid: number; volume: number }
    > = {};
    for (const t of tournaments) {
      const tid = t.id as string;
      const regs = registrations.filter((r) => r.tournament_id === tid);
      const paid = regs.filter((r) => r.payment_status === 'Paid');
      const players = regs.reduce((sum, r) => sum + Number(r.player_count || 0), 0);
      stats[tid] = {
        regs: regs.length,
        players,
        paid: paid.length,
        volume: volumeByTournament.get(tid) ?? 0,
      };
    }

    return NextResponse.json({ tournaments, stats });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tournaments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Create tournament (accepts snake_case body from admin forms). */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Tournament name is required.' }, { status: 400 });
    }

    const slug =
      (typeof body.slug === 'string' && body.slug.trim()) ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

    const type = (typeof body.type === 'string' && body.type) || 'Team';
    const ownerId =
      auth.role === 'customer'
        ? auth.userId
        : typeof body.owner_id === 'string' && body.owner_id
          ? body.owner_id
          : null;

    const preview = JSON.stringify({
      banner_url: body.banner_url,
      sponsors: body.sponsors,
    });
    if (preview.length > 3_500_000) {
      return NextResponse.json(
        {
          error:
            'Banner or sponsor images are too large. Use a smaller banner or fewer/lighter sponsor logos.',
          code: 'payload_too_large',
        },
        { status: 413 }
      );
    }

    const { rows } = await query(
      `INSERT INTO tournaments (
         slug, name, type, venue, fee, min_players, max_players, theme,
         description, registration_deadline, rules, organizer_name, organizer_phone,
         terms, status, is_public, sport, custom_fields, team_custom_fields, form_config,
         banner_url, sponsors, sports_config, precreated_teams, age_categories, owner_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,
         $9,$10,$11,$12,$13,
         $14,$15,$16,$17,$18::jsonb,$19::jsonb,$20::jsonb,
         $21,$22::jsonb,$23::jsonb,$24::jsonb,$25::jsonb,$26
       )
       RETURNING *`,
      [
        slug,
        name,
        type,
        body.venue ?? null,
        Number(body.fee) || 0,
        Number(body.min_players) || 1,
        Number(body.max_players) || 1,
        body.theme || '#6366f1',
        body.description ?? null,
        body.registration_deadline ?? null,
        body.rules ?? null,
        body.organizer_name ?? null,
        body.organizer_phone ?? null,
        body.terms ?? null,
        body.status || 'Active',
        body.is_public !== false,
        (typeof body.sport === 'string' && body.sport.trim()) || 'Cricket',
        jsonb(body.custom_fields ?? []),
        jsonb(body.team_custom_fields ?? []),
        jsonb(body.form_config ?? {}),
        body.banner_url || null,
        jsonb(body.sponsors ?? []),
        jsonb(body.sports_config ?? []),
        jsonb(body.precreated_teams ?? []),
        jsonb(body.age_categories ?? []),
        ownerId,
      ]
    );

    return NextResponse.json(rows[0]);
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; detail?: string };
    const message = err.message || 'Failed to create tournament';
    if (err.code === '23505') {
      return NextResponse.json(
        { error: 'This tournament slug already exists. Change the name or slug.', code: err.code },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message, code: err.code, details: err.detail }, { status: 500 });
  }
}
