import { getServiceSupabase } from '@/lib/supabase/service';

/** Best-effort client IP from common proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    'unknown'
  );
}

export type RateLimitResult = { allowed: boolean };

/**
 * Atomic fixed-window rate limit backed by Postgres (Supabase).
 *
 * Fails OPEN: if the limiter itself errors we allow the request rather than
 * block a legitimate user on a transient DB issue.
 */
export async function checkRateLimit(params: {
  key: string;
  max: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  try {
    const db = getServiceSupabase();
    const { data, error } = await db.rpc('check_rate_limit', {
      p_key: params.key,
      p_max: params.max,
      p_window_seconds: params.windowSeconds,
    });
    if (error) {
      console.warn('Rate limit check failed (allowing):', error.message);
      return { allowed: true };
    }
    return { allowed: data !== false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'rate limit error';
    console.warn('Rate limit check threw (allowing):', message);
    return { allowed: true };
  }
}

/**
 * Convenience guard. Returns a 429 Response when the limit is exceeded,
 * otherwise null. `buckets` lets a single request count against several keys
 * (e.g. per-IP and per-email).
 */
export async function enforceRateLimit(
  request: Request,
  buckets: Array<{ key: string; max: number; windowSeconds: number }>
): Promise<Response | null> {
  for (const bucket of buckets) {
    const { allowed } = await checkRateLimit(bucket);
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: 'Too many requests. Please wait a moment and try again.',
          code: 'rate_limited',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
  return null;
}
