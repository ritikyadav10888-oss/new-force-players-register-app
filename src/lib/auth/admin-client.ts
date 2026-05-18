import { supabase } from '@/lib/supabase';

/** Attach Supabase session token for protected admin API routes. */
export async function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not signed in. Please log in again.');
  }

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, { ...init, headers });
}
