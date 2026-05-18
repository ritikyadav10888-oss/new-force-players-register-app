import { supabase } from '@/lib/supabase';

/** Attach Supabase session token for protected admin API routes. */
export async function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Not signed in. Please log out and sign in again at /admin/login.');
  }

  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed.session;
  }

  if (!session?.access_token) {
    throw new Error('Session expired. Log out and sign in again.');
  }

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, { ...init, headers });
}
