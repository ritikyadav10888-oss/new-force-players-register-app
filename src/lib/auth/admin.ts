import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabase/service';

export type AdminContext = {
  userId: string;
  email: string | undefined;
};

/** Verify Bearer JWT and membership in admin_users (uses service role). */
export async function requireAdmin(request: Request): Promise<AdminContext | null> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

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

  const db = getServiceSupabase();
  const { data: adminRow } = await db
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) return null;

  return { userId: user.id, email: user.email };
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized. Admin login required.' }, { status: 401 });
}
