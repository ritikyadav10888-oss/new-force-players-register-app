import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const db = getServiceSupabase();
    const { data, error } = await db
      .from('tournaments')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
      }
      throw error;
    }

    // Return tournament even when closed — register UI shows the "registration closed" screen.
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tournament';
    console.error('Error fetching tournament by slug:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
