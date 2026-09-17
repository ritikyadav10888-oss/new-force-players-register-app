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
  const existingPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();

  if (existingPath && existsSync(existingPath)) {
    // Reject non-JSON file contents (e.g. someone pasted a filename into the env).
    try {
      const parsed = JSON.parse(readFileSync(existingPath, 'utf8')) as ServiceAccountJson;
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = existingPath;
        return existingPath;
      }
    } catch {
      // fall through to JSON env
    }
  }

  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!inline) {
    throw new Error(
      'Cloud SQL Connector needs FIREBASE_SERVICE_ACCOUNT_JSON (full service-account JSON on Vercel), not a file path.'
    );
  }

  let parsed: ServiceAccountJson;
  try {
    parsed = JSON.parse(inline) as ServiceAccountJson;
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the full contents of the Firebase Admin SDK JSON file (starts with {"type":"service_account"...}).'
    );
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id / client_email / private_key.'
    );
  }

  const dest = join(tmpdir(), 'force-pulse-sa.json');
  // Normalize escaped newlines from env paste
  const normalized = {
    ...parsed,
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
  };
  writeFileSync(dest, JSON.stringify(normalized), 'utf8');
  process.env.GOOGLE_APPLICATION_CREDENTIALS = dest;
  return dest;
}
