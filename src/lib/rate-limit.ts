import { query } from '@/lib/db/pool';

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
 * Atomic fixed-window rate limit backed by Cloud SQL Postgres.
 * Fails OPEN on DB errors.
 */
export async function checkRateLimit(params: {
  key: string;
  max: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  try {
    const { rows } = await query<{ check_rate_limit: boolean }>(
      `SELECT check_rate_limit($1, $2, $3) AS check_rate_limit`,
      [params.key, params.max, params.windowSeconds]
    );
    return { allowed: rows[0]?.check_rate_limit !== false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'rate limit error';
    console.warn('Rate limit check threw (allowing):', message);
    return { allowed: true };
  }
}

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
