import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';

// Only public-facing columns are exposed to the registration page. Internal
// columns (e.g. is_public, created_at) are intentionally excluded so nothing
// internal leaks now or when new columns are added later.
const PUBLIC_TOURNAMENT_COLUMNS = [
  'id',
  'name',
  'slug',
  'type',
  'venue',
  'fee',
  'min_players',
  'max_players',
  'theme',
  'description',
  'rules',
  'terms',
  'organizer_name',
  'organizer_phone',
  'registration_deadline',
  'banner_url',
  'custom_fields',
  'form_config',
  'status',
  'sport',
  'sponsors',
].join(', ');

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const db = getServiceSupabase();
    const { data, error } = await db
      .from('tournaments')
      .select(PUBLIC_TOURNAMENT_COLUMNS)
      .eq('slug', slug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
      }
      console.error('Tournament fetch DB error:', error.message, error.details ?? '');
      return NextResponse.json({ error: 'Failed to fetch tournament' }, { status: 500 });
    }

    // Drafts stay hidden even via direct link. Active/Closed remain reachable so
    // the register UI can show its "registration closed" screen.
    if ((data as { status?: string } | null)?.status === 'Draft') {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tournament';
    console.error('Error fetching tournament by slug:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
