import { readFileSync } from 'fs';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

/**
 * Server-only Firebase Admin (Auth + Storage).
 * Set FIREBASE_SERVICE_ACCOUNT_PATH to the service-account JSON path,
 * or GOOGLE_APPLICATION_CREDENTIALS (standard GCP).
 */
function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const path =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (!path) {
    throw new Error(
      'Missing FIREBASE_SERVICE_ACCOUNT_PATH (or GOOGLE_APPLICATION_CREDENTIALS). Point it at your Firebase Admin SDK JSON.'
    );
  }

  const json = JSON.parse(readFileSync(path, 'utf8')) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  if (!json.project_id || !json.client_email || !json.private_key) {
    throw new Error('Service account JSON is missing project_id / client_email / private_key');
  }

  return initializeApp({
    credential: cert({
      projectId: json.project_id,
      clientEmail: json.client_email,
      privateKey: json.private_key,
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
