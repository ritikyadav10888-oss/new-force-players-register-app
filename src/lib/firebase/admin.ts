import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { loadServiceAccountJson } from '@/lib/gcp/credentials';

/**
 * Server-only Firebase Admin (Auth user admin + Storage).
 * Prefer verifying ID tokens with jose (see lib/auth/firebase-token.ts) on request paths
 * so public/API routes are not blocked by firebase-admin ESM issues on Vercel.
 */
function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const json = loadServiceAccountJson();

  if (!json.project_id || !json.client_email || !json.private_key) {
    throw new Error('Service account JSON is missing project_id / client_email / private_key');
  }

  const privateKey = json.private_key.replace(/\\n/g, '\n');

  return initializeApp({
    credential: cert({
      projectId: json.project_id,
      clientEmail: json.client_email,
      privateKey,
    }),
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${json.project_id}.firebasestorage.app`,
  });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminStorage() {
  return getStorage(getAdminApp());
}
