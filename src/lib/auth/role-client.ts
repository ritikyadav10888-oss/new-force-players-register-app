import { supabase } from '@/lib/supabase';

export type UserRole = 'superadmin' | 'customer' | null;

/** Look up the signed-in user's role from admin_users (client-side). */
export async function getCurrentUserRole(): Promise<UserRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return null;
  return data.role === 'customer' ? 'customer' : 'superadmin';
}
