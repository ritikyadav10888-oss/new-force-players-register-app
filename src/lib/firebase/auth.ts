import { getAuth, type Auth } from 'firebase/auth';
import { getFirebaseApp } from '@/lib/firebase/app';

/** Firebase Auth — replaces Supabase Auth after cutover. */
export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
