import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { imageExtFromDataUrl, uploadDataImage } from '@/lib/firebase/upload';
import { isDataImageUrl } from '@/lib/registrations/create';

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

    const ext = imageExtFromDataUrl(body.dataUrl);
    const id = crypto.randomUUID();
    const path = `drafts/${tournamentId}/${kind}/${id}.${ext}`;

    const url = await uploadDataImage(body.dataUrl, path);
    return NextResponse.json({ url, path });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upload image';
    console.error('Upload error:', message);
    const status = message.includes('too large') ? 413 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
