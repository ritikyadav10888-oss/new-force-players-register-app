import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { loadServiceAccountJson } from '@/lib/gcp/credentials';

/**
 * Server-only Firebase Admin bootstrap for Storage.
 * Never import `firebase-admin/auth` here — on Vercel it crashes with
 * jwks-rsa → jose ERR_REQUIRE_ESM. Auth admin ops use Identity Toolkit REST
 * (`lib/firebase/auth-rest.ts`) instead.
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

/** Lazy — keeps route modules free of firebase-admin until upload/sign time. */
export async function getAdminStorage() {
  const { getStorage } = await import('firebase-admin/storage');
  return getStorage(getAdminApp());
}
