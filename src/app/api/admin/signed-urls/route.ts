import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import { extractStoragePath } from '@/lib/storage/object-path';

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const MAX_ITEMS = 2000;

export async function POST(request: Request) {
  const adminResult = await requireAdmin(request);
  if (!isAdminContext(adminResult)) {
    return unauthorizedResponse(adminResult.failure);
  }

  try {
    const body = (await request.json()) as { values?: unknown };
    const values = Array.isArray(body.values) ? body.values : [];
    if (values.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: `Too many items (max ${MAX_ITEMS}).` },
        { status: 400 }
      );
    }

    // Map each original value to its bucket object path; de-duplicate paths.
    const urls: Record<string, string> = {};
    const pathToOriginals = new Map<string, string[]>();
    for (const raw of values) {
      const original = typeof raw === 'string' ? raw : '';
      const path = extractStoragePath(original);
      if (!path) continue;
      const list = pathToOriginals.get(path);
      if (list) list.push(original);
      else pathToOriginals.set(path, [original]);
    }

    const uniquePaths = [...pathToOriginals.keys()];
    if (uniquePaths.length === 0) {
      return NextResponse.json({ urls });
    }

    const db = getServiceSupabase();
    const { data, error } = await db.storage
      .from('uploads')
      .createSignedUrls(uniquePaths, THIRTY_DAYS_SECONDS);
    if (error) throw error;

    for (const item of data || []) {
      if (!item?.path || !item.signedUrl) continue;
      const originals = pathToOriginals.get(item.path);
      if (!originals) continue;
      for (const original of originals) {
        urls[original] = item.signedUrl;
      }
    }

    return NextResponse.json({ urls });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to sign URLs';
    console.error('Signed URL error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
