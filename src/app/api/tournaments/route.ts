import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import { getServiceSupabase } from '@/lib/supabase/service';
import { normalizeSponsorsForSave, parseSponsorsFromApi } from '@/lib/sponsors';

function getPublicSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeSponsorsFromBody(body: Record<string, unknown>) {
  if (Array.isArray(body.sponsors)) {
    return normalizeSponsorsForSave(parseSponsorsFromApi(body.sponsors));
  }
  if (typeof body.sponsorName === 'string' && body.sponsorName.trim()) {
    return normalizeSponsorsForSave([{ name: body.sponsorName.trim(), logo: '' }]);
  }
  return [];
}

export async function GET() {
  try {
    const db = getPublicSupabase();
    const { data, error } = await db
      .from('tournaments')
      .select('*')
      .eq('status', 'Active')
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
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
    let db;
    try {
      db = getServiceSupabase();
    } catch (configErr) {
      const msg =
        configErr instanceof Error ? configErr.message : 'Server database config error';
      return NextResponse.json({ error: msg, code: 'server_config' }, { status: 503 });
    }

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
    const row = {
      slug,
      name: String(body.name).trim(),
      type: body.type || 'Team',
      venue: body.venue ?? null,
      fee: Number(body.fee) || 0,
      min_players:
        (body.type || 'Team') === 'Team'
          ? Math.min(Number(body.minPlayers) || 1, Number(body.maxPlayers) || 1)
          : 1,
      max_players: Number(body.maxPlayers) || 1,
      theme: body.theme || '#6366f1',
      description: body.description ?? null,
      registration_deadline: body.registrationDeadline ?? null,
      rules: body.rules ?? null,
      organizer_name: body.organizerName ?? null,
      organizer_phone: body.organizerPhone ?? null,
      terms: body.terms ?? null,
      status: body.status || 'Active',
      is_public: body.isPublic !== false,
      custom_fields: body.customFields || [],
      form_config: body.formConfig || {},
      banner_url: body.bannerUrl || null,
      sponsors,
      sport:
        typeof body.sport === 'string' && body.sport.trim() ? body.sport.trim() : 'Cricket',
    };

    const payloadSize = JSON.stringify(row).length;
    if (payloadSize > 3_500_000) {
      return NextResponse.json(
        {
          error:
            'Banner or sponsor images are too large. Use a smaller banner or fewer/lighter sponsor logos.',
          code: 'payload_too_large',
        },
        { status: 413 }
      );
    }

    const { data, error } = await db.from('tournaments').insert([row]).select().single();

    if (error) {
      console.error('Tournament insert error:', error.code, error.message, error.details);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This tournament slug already exists. Change the name or slug.', code: error.code },
          { status: 409 }
        );
      }
      throw error;
    }
    return NextResponse.json(data);
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; details?: string };
    const message = err.message || 'Failed to create tournament';
    console.error('Error creating tournament:', message, err.code, err.details);
    const status =
      message.includes('Missing SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('NEXT_PUBLIC_SUPABASE')
        ? 503
        : 500;
    return NextResponse.json(
      { error: message, code: err.code, details: err.details },
      { status }
    );
  }
}
