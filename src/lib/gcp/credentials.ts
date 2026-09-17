import { existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

/**
 * Load Firebase/GCP service account from:
 * 1) FIREBASE_SERVICE_ACCOUNT_JSON (raw JSON — preferred on Vercel)
 * 2) FIREBASE_SERVICE_ACCOUNT_PATH / GOOGLE_APPLICATION_CREDENTIALS (local file)
 */
export function loadServiceAccountJson(): ServiceAccountJson {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) {
    return JSON.parse(inline) as ServiceAccountJson;
  }

  const path =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (!path) {
    throw new Error(
      'Missing FIREBASE_SERVICE_ACCOUNT_JSON (Vercel) or FIREBASE_SERVICE_ACCOUNT_PATH (local).'
    );
  }

  if (!existsSync(path)) {
    throw new Error(
      `Service account file not found at "${path}". On Vercel, set FIREBASE_SERVICE_ACCOUNT_JSON to the full JSON contents instead of a file path.`
    );
  }

  return JSON.parse(readFileSync(path, 'utf8')) as ServiceAccountJson;
}

/** Ensure ADC file exists for Cloud SQL Connector (writes /tmp when JSON env is set). */
export function ensureGoogleApplicationCredentials(): string | null {
  const existing =
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (existing && existsSync(existing)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = existing;
    return existing;
  }

  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!inline) return existing || null;

  const dest = join(tmpdir(), 'force-pulse-sa.json');
  if (!existsSync(dest)) {
    writeFileSync(dest, inline, 'utf8');
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = dest;
  return dest;
}
