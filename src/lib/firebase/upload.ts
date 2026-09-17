import { getAdminStorage } from '@/lib/firebase/admin';
import { isDataImageUrl } from '@/lib/registrations/create';

const SIGNED_URL_TTL_MS = 120 * 24 * 60 * 60 * 1000;

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

export function imageExtFromDataUrl(dataUrl: string): string {
  return extForMime(parseDataUrl(dataUrl).mime);
}

/** Upload a data:image URL to Firebase Storage; returns a signed read URL. */
export async function uploadDataImage(dataUrl: string, path: string): Promise<string> {
  if (!isDataImageUrl(dataUrl)) throw new Error('Expected a data:image URL');
  const { mime, base64 } = parseDataUrl(dataUrl);
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 2_500_000) {
    throw new Error('Photo is too large. Please upload a smaller image.');
  }

  const bucket = getAdminStorage().bucket();
  const file = bucket.file(path);
  await file.save(bytes, {
    contentType: mime,
    resumable: false,
    metadata: { cacheControl: 'public,max-age=31536000' },
  });

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + SIGNED_URL_TTL_MS,
  });
  return signedUrl;
}

/** Sign one or more Firebase Storage object paths for admin reads. */
export async function signStoragePaths(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const bucket = getAdminStorage().bucket();
  const expires = Date.now() + SIGNED_URL_TTL_MS;
  const results = await Promise.all(
    paths.map(async (path) => {
      try {
        const [signedUrl] = await bucket.file(path).getSignedUrl({
          action: 'read',
          expires,
        });
        return [path, signedUrl] as const;
      } catch {
        return null;
      }
    })
  );
  return new Map(results.filter((r): r is readonly [string, string] => r != null));
}

export async function deleteStoragePath(path: string): Promise<void> {
  try {
    await getAdminStorage().bucket().file(path).delete({ ignoreNotFound: true });
  } catch {
    // best-effort cleanup
  }
}

/** Turn a stored photo ref (bare path, signed URL, or data:) into a browser-loadable URL. */
export async function resolveReadableUrl(
  value: string | null | undefined
): Promise<string | null> {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-') return null;
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) return trimmed;
  const signed = await signStoragePaths([trimmed]);
  return signed.get(trimmed) || null;
}

/** Batch-resolve stored image refs for API responses. */
export async function resolveReadableUrls(
  values: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const toSign: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed === '-') continue;
    if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) {
      out.set(trimmed, trimmed);
    } else {
      toSign.push(trimmed);
    }
  }
  const signed = await signStoragePaths([...new Set(toSign)]);
  for (const [path, url] of signed) out.set(path, url);
  return out;
}
