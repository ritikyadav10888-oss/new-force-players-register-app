import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import { getServiceSupabase } from '@/lib/supabase/service';
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

export async function GET() {
  try {
    const db = getServiceSupabase();
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
  const admin = await requireAdmin(request);
  if (!admin) return unauthorizedResponse();

  try {
    const body = await request.json();
    const slug =
      body.slug ||
      body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const db = getServiceSupabase();
    const { data, error } = await db
      .from('tournaments')
      .insert([
        {
          slug,
          name: body.name,
          type: body.type,
          venue: body.venue,
          fee: body.fee,
          max_players: body.maxPlayers,
          theme: body.theme,
          description: body.description,
          registration_deadline: body.registrationDeadline,
          rules: body.rules,
          organizer_name: body.organizerName,
          organizer_phone: body.organizerPhone,
          terms: body.terms,
          status: body.status || 'Active',
          is_public: body.isPublic !== false,
          custom_fields: body.customFields || [],
          form_config: body.formConfig || {},
          banner_url: body.bannerUrl || null,
          sponsors: normalizeSponsorsFromBody(body as Record<string, unknown>),
          sport:
            typeof body.sport === 'string' && body.sport.trim()
              ? body.sport.trim()
              : 'Cricket',
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create tournament';
    console.error('Error creating tournament:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
