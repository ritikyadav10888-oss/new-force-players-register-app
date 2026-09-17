import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateEmail,
  updatePassword,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/auth';

/** Attach Firebase ID token for protected admin API routes. */
export async function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not signed in. Please log out and sign in again at /admin/login.');
  }

  const accessToken = await user.getIdToken();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, { ...init, headers });
}

export async function adminSignIn(email: string, password: string) {
  return signInWithEmailAndPassword(getFirebaseAuth(), email, password);
}

export async function adminSignOut() {
  return signOut(getFirebaseAuth());
}

export function watchAdminAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), cb);
}

export async function getAdminIdToken(): Promise<string | null> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  return user.getIdToken();
}

export async function updateAdminCredentials(updates: {
  email?: string;
  password?: string;
}) {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not signed in.');
  if (updates.email && updates.email !== user.email) {
    await updateEmail(user, updates.email);
  }
  if (updates.password) {
    await updatePassword(user, updates.password);
  }
}
