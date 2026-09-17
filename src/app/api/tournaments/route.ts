import { NextResponse } from 'next/server';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import { query } from '@/lib/db/pool';
import { normalizeSponsorsForSave, parseSponsorsFromApi } from '@/lib/sponsors';

function normalizeSponsorsFromBody(body: Record<string, unknown>) {
  if (Array.isArray(body.sponsors)) {
    return normalizeSponsorsForSave(parseSponsorsFromApi(body.sponsors));
  }
  if (typeof body.sponsorName === 'string' && body.sponsorName.trim()) {
    return normalizeSponsorsForSave([{ name: body.sponsorName.trim(), logo: '' }]);
  }
  return [];
}

function jsonb(value: unknown) {
  return JSON.stringify(value ?? null);
}

export async function GET() {
  try {
    const { rows } = await query(
      `SELECT *
       FROM tournaments
       WHERE status = 'Active' AND is_public = true
       ORDER BY created_at DESC`
    );
    return NextResponse.json(rows);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tournaments';
    console.error('Error fetching tournaments:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const adminResult = await requireAdmin(request);
  if (!isAdminContext(adminResult)) {
    return unauthorizedResponse(adminResult.failure);
  }

  try {
    const body = await request.json();
    if (!body?.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'Tournament name is required.' }, { status: 400 });
    }

    const slug =
      body.slug ||
      String(body.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

    const sponsors = normalizeSponsorsFromBody(body as Record<string, unknown>);
    const type = body.type || 'Team';
    const minPlayers =
      type === 'Team'
        ? Math.min(Number(body.minPlayers) || 1, Number(body.maxPlayers) || 1)
        : 1;
    const maxPlayers = Number(body.maxPlayers) || 1;
    const customFields = body.customFields || [];
    const formConfig = body.formConfig || {};
    const sport =
      typeof body.sport === 'string' && body.sport.trim() ? body.sport.trim() : 'Cricket';

    const rowPreview = {
      slug,
      name: String(body.name).trim(),
      sponsors,
      customFields,
      formConfig,
      bannerUrl: body.bannerUrl || null,
    };
    if (JSON.stringify(rowPreview).length > 3_500_000) {
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
         terms, status, is_public, custom_fields, form_config, banner_url, sponsors, sport
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,
         $9,$10,$11,$12,$13,
         $14,$15,$16,$17::jsonb,$18::jsonb,$19,$20::jsonb,$21
       )
       RETURNING *`,
      [
        slug,
        String(body.name).trim(),
        type,
        body.venue ?? null,
        Number(body.fee) || 0,
        minPlayers,
        maxPlayers,
        body.theme || '#6366f1',
        body.description ?? null,
        body.registrationDeadline ?? null,
        body.rules ?? null,
        body.organizerName ?? null,
        (typeof body.organizerPhone === 'string'
          ? body.organizerPhone.trim()
          : body.organizerPhone) || null,
        body.terms ?? null,
        body.status || 'Active',
        body.isPublic !== false,
        jsonb(customFields),
        jsonb(formConfig),
        body.bannerUrl || null,
        jsonb(sponsors),
        sport,
      ]
    );

    return NextResponse.json(rows[0]);
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; detail?: string };
    const message = err.message || 'Failed to create tournament';
    console.error('Error creating tournament:', message, err.code, err.detail);
    if (err.code === '23505') {
      return NextResponse.json(
        { error: 'This tournament slug already exists. Change the name or slug.', code: err.code },
        { status: 409 }
      );
    }
    const status =
      message.includes('Missing') || message.includes('CLOUD_SQL') || message.includes('DATABASE')
        ? 503
        : 500;
    return NextResponse.json(
      { error: message, code: err.code, details: err.detail },
      { status }
    );
  }
}
