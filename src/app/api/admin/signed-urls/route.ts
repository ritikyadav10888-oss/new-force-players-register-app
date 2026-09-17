import { NextResponse } from 'next/server';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';
import { extractStoragePath } from '@/lib/storage/object-path';
import { signStoragePaths } from '@/lib/firebase/upload';

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

    const signed = await signStoragePaths(uniquePaths);
    for (const [path, signedUrl] of signed) {
      const originals = pathToOriginals.get(path);
      if (!originals) continue;
      for (const original of originals) {
        urls[original] = signedUrl;
      }
    }

    return NextResponse.json({ urls });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to sign URLs';
    console.error('Signed URL error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
