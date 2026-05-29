/**
 * Stored image references can be one of:
 *  - a Supabase public URL:  https://<proj>/storage/v1/object/public/uploads/drafts/...
 *  - a Supabase signed URL:  https://<proj>/storage/v1/object/sign/uploads/drafts/...?token=...
 *  - a bare object path:     drafts/<tournamentId>/<kind>/<id>.jpg
 *
 * To re-sign for admin reads we only need the object path *inside* the bucket.
 * This extracts that path from any of the above, or returns null for values we
 * can't sign (empty, base64 data URLs, or URLs from a different bucket).
 */
const BUCKET_MARKER = '/uploads/';

export function extractStoragePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-') return null;

  // base64 data URLs can't be signed.
  if (trimmed.startsWith('data:')) return null;

  // Full public/signed URL -> take the part after `/uploads/`, drop any query string.
  const markerIdx = trimmed.indexOf(BUCKET_MARKER);
  if (markerIdx !== -1) {
    let path = trimmed.slice(markerIdx + BUCKET_MARKER.length);
    const queryIdx = path.indexOf('?');
    if (queryIdx !== -1) path = path.slice(0, queryIdx);
    path = path.replace(/^\/+/, '');
    try {
      path = decodeURIComponent(path);
    } catch {
      // keep raw if it isn't valid percent-encoding
    }
    return path || null;
  }

  // An http(s) URL without the uploads marker belongs to a different bucket/host.
  if (/^https?:\/\//i.test(trimmed)) return null;

  // Otherwise treat it as an already-bare object path.
  return trimmed.replace(/^\/+/, '');
}
