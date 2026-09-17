import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';

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
  'sports_config',
  'precreated_teams',
  'age_categories',
  'team_custom_fields',
].join(', ');

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { rows } = await query(
      `SELECT ${PUBLIC_TOURNAMENT_COLUMNS}
       FROM tournaments
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );
    const data = rows[0];

    if (!data) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    if ((data as { status?: string }).status === 'Draft') {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tournament';
    console.error('Error fetching tournament by slug:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
