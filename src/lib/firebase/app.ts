import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirebaseWebConfig } from '@/lib/firebase/config';

/** Shared Firebase app (client or server). Safe to call multiple times. */
export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  return initializeApp(getFirebaseWebConfig());
}
