import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import crypto from 'node:crypto';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';

const SIGNED_URL_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

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

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimited = await enforceRateLimit(request, [
      { key: `upload:ip:${ip}`, max: 40, windowSeconds: 60 },
    ]);
    if (rateLimited) return rateLimited;

    const body = (await request.json()) as {
      dataUrl?: unknown;
      kind?: unknown;
      tournamentId?: unknown;
    };

    if (!isDataImageUrl(body.dataUrl)) {
      return NextResponse.json({ error: 'dataUrl must be a base64 image.' }, { status: 400 });
    }

    const kind = String(body.kind || '').trim().toLowerCase();
    if (kind !== 'player' && kind !== 'team') {
      return NextResponse.json({ error: 'kind must be player or team.' }, { status: 400 });
    }

    const tournamentId = String(body.tournamentId || '').trim();
    if (!tournamentId) {
      return NextResponse.json({ error: 'tournamentId is required.' }, { status: 400 });
    }

    const db = getServiceSupabase();
    const { mime, base64 } = parseDataUrl(body.dataUrl);
    const bytes = Buffer.from(base64, 'base64');

    // Keep uploads small (decoded bytes).
    if (bytes.length > 2_500_000) {
      return NextResponse.json(
        { error: 'Image is too large. Please upload a smaller image.' },
        { status: 413 }
      );
    }

    const ext = extForMime(mime);
    const id = crypto.randomUUID();
    const path = `drafts/${tournamentId}/${kind}/${id}.${ext}`;

    const { error } = await db.storage.from('uploads').upload(path, bytes, {
      contentType: mime,
      upsert: true,
    });
    if (error) throw error;

    const { data, error: signError } = await db.storage
      .from('uploads')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signError || !data?.signedUrl) {
      throw signError || new Error('Failed to generate image URL.');
    }

    return NextResponse.json({ url: data.signedUrl, path });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upload image';
    console.error('Upload error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

