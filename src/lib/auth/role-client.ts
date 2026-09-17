import { getAdminIdToken } from '@/lib/auth/admin-client';

export type UserRole = 'superadmin' | 'customer' | null;

type MeResponse = {
  role?: string;
  displayName?: string | null;
  logoUrl?: string | null;
  email?: string;
  error?: string;
};

async function fetchMe(): Promise<MeResponse | null> {
  const accessToken = await getAdminIdToken();
  if (!accessToken) return null;

  const res = await fetch('/api/admin/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as MeResponse;
}

/** Look up the signed-in user's role from Cloud SQL admin_users via API. */
export async function getCurrentUserRole(): Promise<UserRole> {
  const me = await fetchMe();
  if (!me?.role) return null;
  return me.role === 'customer' ? 'customer' : 'superadmin';
}

/** Full admin profile for layouts (role + branding). */
export async function getCurrentAdminProfile() {
  return fetchMe();
}
