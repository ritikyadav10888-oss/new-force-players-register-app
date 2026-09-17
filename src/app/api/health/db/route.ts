import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';

/** Smoke-test Cloud SQL connectivity. Remove or protect after cutover. */
export async function GET() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DB_HEALTH !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const result = await query<{ ok: number; now: string }>(
      'select 1 as ok, now()::text as now'
    );
    return NextResponse.json({
      ok: true,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
      db: result.rows[0],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
