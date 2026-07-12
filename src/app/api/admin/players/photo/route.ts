import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';
import { extractStoragePath } from '@/lib/storage/object-path';

const SIGNED_URL_TTL_SECONDS = 120 * 24 * 60 * 60; // 120 days

function isDataImageUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/') && v.includes(';base64,');
}

function parseDataUrl(dataUrl: string): { mime: string; base64: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) throw new Error('Invalid image data URL.');
  return { mime: m[1], base64: m[2] };
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

    const db = getServiceSupabase();

    const { data: player, error: playerError } = await db
      .from('players')
      .select('id, registration_id, photo_url')
      .eq('id', playerId)
      .single();
    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    }

    const { mime, base64 } = parseDataUrl(body.dataUrl);
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > 2_500_000) {
      return NextResponse.json(
        { error: 'Photo is too large. Please upload a smaller image.' },
        { status: 413 }
      );
    }

    const ext = extForMime(mime);
    const newPath = `players/${player.registration_id}/${player.id}.${ext}`;

    const { error: uploadError } = await db.storage.from('uploads').upload(newPath, bytes, {
      contentType: mime,
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data: signed, error: signError } = await db.storage
      .from('uploads')
      .createSignedUrl(newPath, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      throw signError || new Error('Failed to generate photo URL.');
    }

    const { error: updateError } = await db
      .from('players')
      .update({ photo_url: signed.signedUrl })
      .eq('id', player.id);
    if (updateError) throw updateError;

    // Clean up the previous file if it lived in storage at a different path.
    const oldPath = extractStoragePath(player.photo_url);
    if (oldPath && oldPath !== newPath) {
      await db.storage.from('uploads').remove([oldPath]);
    }

    return NextResponse.json({ url: signed.signedUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update photo';
    console.error('Player photo update error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
