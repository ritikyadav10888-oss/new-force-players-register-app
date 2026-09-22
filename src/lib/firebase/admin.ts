import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { loadServiceAccountJson } from '@/lib/gcp/credentials';

/**
 * Server-only Firebase Admin bootstrap.
 * Do NOT statically import `firebase-admin/auth` here — on Vercel it pulls
 * jwks-rsa → jose and crashes with ERR_REQUIRE_ESM. Auth is loaded lazily
 * only when getAdminAuth() is called. Storage is safe to load on demand too.
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

/** Lazy — avoids loading firebase-admin/auth (jose ESM break) unless needed. */
export async function getAdminAuth() {
  const { getAuth } = await import('firebase-admin/auth');
  return getAuth(getAdminApp());
}

/** Lazy — keeps route modules free of firebase-admin until upload/sign time. */
export async function getAdminStorage() {
  const { getStorage } = await import('firebase-admin/storage');
  return getStorage(getAdminApp());
}
