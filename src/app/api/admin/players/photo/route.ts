import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';
import { extractStoragePath } from '@/lib/storage/object-path';
import { deleteStoragePath, uploadDataImage } from '@/lib/firebase/upload';
import { isDataImageUrl } from '@/lib/registrations/create';

function parseDataUrl(dataUrl: string): { mime: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) throw new Error('Invalid image data URL.');
  return { mime: m[1] };
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return 'jpg';
}

/** Superadmin: upload/replace a single player's photo (fixes missing photos). */
export async function POST(request: Request) {
  const adminResult = await requireSuperadmin(request);
  if (!isAdminContext(adminResult)) {
    return unauthorizedResponse(adminResult.failure);
  }

  try {
    const body = (await request.json()) as { playerId?: unknown; dataUrl?: unknown };
    const playerId = typeof body.playerId === 'string' ? body.playerId.trim() : '';
    if (!playerId) {
      return NextResponse.json({ error: 'playerId is required.' }, { status: 400 });
    }
    if (!isDataImageUrl(body.dataUrl)) {
      return NextResponse.json({ error: 'dataUrl must be a base64 image.' }, { status: 400 });
    }

    const { rows } = await query<{
      id: string;
      registration_id: string;
      photo_url: string | null;
    }>(`SELECT id, registration_id, photo_url FROM players WHERE id = $1 LIMIT 1`, [playerId]);
    const player = rows[0];
    if (!player) {
      return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    }

    const { mime } = parseDataUrl(body.dataUrl);
    const ext = extForMime(mime);
    const newPath = `players/${player.registration_id}/${player.id}.${ext}`;

    const signedUrl = await uploadDataImage(body.dataUrl, newPath);

    await query(`UPDATE players SET photo_url = $2 WHERE id = $1`, [player.id, signedUrl]);

    const oldPath = extractStoragePath(player.photo_url);
    if (oldPath && oldPath !== newPath) {
      await deleteStoragePath(oldPath);
    }

    return NextResponse.json({ url: signedUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update photo';
    console.error('Player photo update error:', message);
    const status = message.includes('too large') ? 413 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
