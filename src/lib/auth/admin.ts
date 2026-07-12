import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabase/service';

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

/** Verify Bearer JWT and membership in admin_users (uses service role). */
export async function requireAdmin(
  request: Request
): Promise<AdminContext | { failure: AdminAuthFailure }> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { failure: 'no_token' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { failure: 'server_config' };

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user) return { failure: 'invalid_session' };

  let db;
  try {
    db = getServiceSupabase();
  } catch {
    return { failure: 'server_config' };
  }

  const { data: adminRow } = await db
    .from('admin_users')
    .select('user_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) return { failure: 'not_allowlisted' };

  const role: AdminRole = adminRow.role === 'customer' ? 'customer' : 'superadmin';
  return { userId: user.id, email: user.email, role };
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
    'Server misconfigured: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY on Vercel (then redeploy).',
  invalid_session:
    'Session expired or invalid. Log out and sign in again. On Vercel, confirm Supabase Auth redirect URLs include your site URL.',
  not_allowlisted:
    'Signed in but not an admin. In Supabase SQL Editor run: INSERT INTO admin_users (user_id) VALUES (\'your-user-uuid\'); — get UUID from Admin → Settings.',
  forbidden: 'You do not have permission to perform this action.',
};

export function unauthorizedResponse(failure: AdminAuthFailure = 'no_token') {
  const status = failure === 'forbidden' ? 403 : 401;
  return Response.json(
    { error: FAILURE_MESSAGES[failure], code: failure },
    { status }
  );
}
