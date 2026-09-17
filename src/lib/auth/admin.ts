import { createClient } from '@supabase/supabase-js';
import { query } from '@/lib/db/pool';
import { verifyFirebaseIdToken } from '@/lib/auth/firebase-token';

export type AdminRole = 'superadmin' | 'customer';

export type AdminContext = {
  userId: string;
  email: string | undefined;
  role: AdminRole;
};

export type AdminAuthFailure =
  | 'no_token'
  | 'server_config'
  | 'invalid_session'
  | 'not_allowlisted'
  | 'forbidden';

async function verifyBearerUser(
  token: string
): Promise<{ userId: string; email?: string } | null> {
  // Prefer Firebase ID token via jose (no firebase-admin on this path).
  const firebaseUser = await verifyFirebaseIdToken(token);
  if (firebaseUser) return firebaseUser;

  // Legacy Supabase JWT during transition.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);
  if (error || !user) return null;
  return { userId: user.id, email: user.email };
}

/** Verify Bearer JWT (Firebase Auth, with Supabase fallback) + Cloud SQL admin_users. */
export async function requireAdmin(
  request: Request
): Promise<AdminContext | { failure: AdminAuthFailure }> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { failure: 'no_token' };

  let identity: { userId: string; email?: string } | null = null;
  try {
    identity = await verifyBearerUser(token);
  } catch {
    return { failure: 'server_config' };
  }
  if (!identity) return { failure: 'invalid_session' };

  try {
    const { rows } = await query<{ role: string | null }>(
      `SELECT role FROM admin_users WHERE user_id = $1 LIMIT 1`,
      [identity.userId]
    );
    const adminRow = rows[0];
    if (!adminRow) return { failure: 'not_allowlisted' };

    const role: AdminRole = adminRow.role === 'customer' ? 'customer' : 'superadmin';
    return { userId: identity.userId, email: identity.email, role };
  } catch {
    return { failure: 'server_config' };
  }
}

/** Verify Bearer JWT and require the superadmin role. */
export async function requireSuperadmin(
  request: Request
): Promise<AdminContext | { failure: AdminAuthFailure }> {
  const result = await requireAdmin(request);
  if (!isAdminContext(result)) return result;
  if (result.role !== 'superadmin') return { failure: 'forbidden' };
  return result;
}

export function isAdminContext(
  result: AdminContext | { failure: AdminAuthFailure }
): result is AdminContext {
  return 'userId' in result;
}

const FAILURE_MESSAGES: Record<AdminAuthFailure, string> = {
  no_token: 'Not signed in. Log out, open /admin/login, and sign in again.',
  server_config:
    'Server misconfigured: set Cloud SQL env vars and FIREBASE_SERVICE_ACCOUNT_JSON on Vercel (then redeploy).',
  invalid_session:
    'Session expired or invalid. Log out and sign in again at /admin/login.',
  not_allowlisted:
    'Signed in but not an admin. Insert your user UUID into Cloud SQL admin_users.',
  forbidden: 'You do not have permission to perform this action.',
};

export function unauthorizedResponse(failure: AdminAuthFailure = 'no_token') {
  const status = failure === 'forbidden' ? 403 : 401;
  return Response.json(
    { error: FAILURE_MESSAGES[failure], code: failure },
    { status }
  );
}
