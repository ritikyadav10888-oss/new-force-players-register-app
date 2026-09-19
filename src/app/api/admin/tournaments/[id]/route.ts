import { NextResponse } from 'next/server';
import { getDbPool, query } from '@/lib/db/pool';
import {
  isAdminContext,
  requireAdmin,
  requireSuperadmin,
  unauthorizedResponse,
  type AdminContext,
} from '@/lib/auth/admin';

function jsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

async function loadTournament(id: string) {
  const { rows } = await query(`SELECT * FROM tournaments WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] as Record<string, unknown> | undefined;
}

function canAccessTournament(auth: AdminContext, tournament: Record<string, unknown>) {
  if (auth.role === 'superadmin') return true;
  return tournament.owner_id === auth.userId;
}

/**
 * Delete a tournament and every player / registration / invite row tied to it.
 * Explicit cleanup (not only FK CASCADE) so orphan players with tournament_id
 * or registration-only links are removed too.
 */
async function deleteTournamentCascade(tournamentId: string) {
  const pool = await getDbPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Team-link pending roster (invite players → invites)
    await client.query(
      `UPDATE payment_orders
       SET team_invite_id = NULL
       WHERE team_invite_id IN (
         SELECT id FROM team_invites WHERE tournament_id = $1
       )`,
      [tournamentId]
    );
    await client.query(
      `DELETE FROM team_invite_players
       WHERE team_invite_id IN (
         SELECT id FROM team_invites WHERE tournament_id = $1
       )`,
      [tournamentId]
    );
    await client.query(`DELETE FROM team_invites WHERE tournament_id = $1`, [tournamentId]);

    // All player rows for this tournament (direct + via registration)
    const playersResult = await client.query(
      `DELETE FROM players
       WHERE tournament_id = $1
          OR registration_id IN (
               SELECT id FROM registrations WHERE tournament_id = $1
             )`,
      [tournamentId]
    );

    const regsResult = await client.query(
      `DELETE FROM registrations WHERE tournament_id = $1`,
      [tournamentId]
    );

    // Ledger rows for this tournament (CASCADE would also do this)
    await client.query(`DELETE FROM payment_orders WHERE tournament_id = $1`, [tournamentId]);

    const tourResult = await client.query(`DELETE FROM tournaments WHERE id = $1`, [
      tournamentId,
    ]);

    await client.query('COMMIT');

    return {
      deleted: (tourResult.rowCount ?? 0) > 0,
      playersDeleted: playersResult.rowCount ?? 0,
      registrationsDeleted: regsResult.rowCount ?? 0,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { id } = await params;
    const tournament = await loadTournament(id);
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    if (!canAccessTournament(auth, tournament)) {
      return unauthorizedResponse('forbidden');
    }
    return NextResponse.json(tournament);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tournament';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { id } = await params;
    const existing = await loadTournament(id);
    if (!existing) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }
    if (!canAccessTournament(auth, existing)) {
      return unauthorizedResponse('forbidden');
    }

    const body = (await request.json()) as Record<string, unknown>;

    // Dashboard-style partial updates (status / is_public only)
    if (
      Object.keys(body).every((k) => k === 'status' || k === 'is_public' || k === 'isPublic')
    ) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      if (typeof body.status === 'string') {
        sets.push(`status = $${i++}`);
        vals.push(body.status);
      }
      if (typeof body.is_public === 'boolean' || typeof body.isPublic === 'boolean') {
        sets.push(`is_public = $${i++}`);
        vals.push(typeof body.is_public === 'boolean' ? body.is_public : body.isPublic);
      }
      if (sets.length === 0) {
        return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
      }
      vals.push(id);
      const { rows } = await query(
        `UPDATE tournaments SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        vals
      );
      return NextResponse.json(rows[0]);
    }

    const ownerId =
      auth.role === 'customer'
        ? auth.userId
        : body.owner_id === null
          ? null
          : typeof body.owner_id === 'string'
            ? body.owner_id || null
            : (existing.owner_id as string | null);

    const { rows } = await query(
      `UPDATE tournaments SET
         slug = COALESCE($2, slug),
         name = COALESCE($3, name),
         type = COALESCE($4, type),
         venue = $5,
         fee = COALESCE($6, fee),
         min_players = COALESCE($7, min_players),
         max_players = COALESCE($8, max_players),
         theme = COALESCE($9, theme),
         description = $10,
         registration_deadline = $11,
         rules = $12,
         organizer_name = $13,
         organizer_phone = $14,
         terms = $15,
         status = COALESCE($16, status),
         is_public = COALESCE($17, is_public),
         sport = COALESCE($18, sport),
         custom_fields = COALESCE($19::jsonb, custom_fields),
         team_custom_fields = COALESCE($20::jsonb, team_custom_fields),
         form_config = COALESCE($21::jsonb, form_config),
         banner_url = $22,
         sponsors = COALESCE($23::jsonb, sponsors),
         sports_config = COALESCE($24::jsonb, sports_config),
         precreated_teams = COALESCE($25::jsonb, precreated_teams),
         age_categories = COALESCE($26::jsonb, age_categories),
         owner_id = $27
       WHERE id = $1
       RETURNING *`,
      [
        id,
        typeof body.slug === 'string' ? body.slug : null,
        typeof body.name === 'string' ? body.name : null,
        typeof body.type === 'string' ? body.type : null,
        body.venue ?? null,
        body.fee != null ? Number(body.fee) || 0 : null,
        body.min_players != null ? Number(body.min_players) || 1 : null,
        body.max_players != null ? Number(body.max_players) || 1 : null,
        typeof body.theme === 'string' ? body.theme : null,
        body.description ?? null,
        body.registration_deadline ?? null,
        body.rules ?? null,
        body.organizer_name ?? null,
        body.organizer_phone ?? null,
        body.terms ?? null,
        typeof body.status === 'string' ? body.status : null,
        typeof body.is_public === 'boolean' ? body.is_public : null,
        typeof body.sport === 'string' ? body.sport : null,
        body.custom_fields != null ? jsonb(body.custom_fields) : null,
        body.team_custom_fields != null ? jsonb(body.team_custom_fields) : null,
        body.form_config != null ? jsonb(body.form_config) : null,
        body.banner_url ?? null,
        body.sponsors != null ? jsonb(body.sponsors) : null,
        body.sports_config != null ? jsonb(body.sports_config) : null,
        body.precreated_teams != null ? jsonb(body.precreated_teams) : null,
        body.age_categories != null ? jsonb(body.age_categories) : null,
        ownerId,
      ]
    );

    return NextResponse.json(rows[0]);
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string };
    if (err.code === '23505') {
      return NextResponse.json(
        { error: 'This tournament slug already exists. Change the name or slug.', code: err.code },
        { status: 409 }
      );
    }
    const message = err.message || 'Failed to update tournament';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { id } = await params;
    const existing = await loadTournament(id);
    if (!existing) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const result = await deleteTournamentCascade(id);
    if (!result.deleted) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      playersDeleted: result.playersDeleted,
      registrationsDeleted: result.registrationsDeleted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete tournament';
    console.error('[api/admin/tournaments/[id] DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
