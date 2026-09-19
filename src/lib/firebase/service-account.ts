import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export type ServiceAccountJson = {
  type?: string;
  project_id: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
  universe_domain?: string;
};

/**
 * Load Firebase/GCP service account for Vercel + local.
 * Prefer FIREBASE_SERVICE_ACCOUNT_JSON (full JSON string) on Vercel.
 * Locally you can use FIREBASE_SERVICE_ACCOUNT_PATH / GOOGLE_APPLICATION_CREDENTIALS.
 */
export function loadServiceAccount(): ServiceAccountJson {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) {
    const json = JSON.parse(inline) as ServiceAccountJson;
    if (!json.project_id || !json.client_email || !json.private_key) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id / client_email / private_key'
      );
    }
    // Connector / GoogleAuth often expect a credentials file path.
    ensureCredentialsFile(json);
    return normalizePrivateKey(json);
  }

  const path =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (!path) {
    throw new Error(
      'Missing Firebase service account. Set FIREBASE_SERVICE_ACCOUNT_JSON on Vercel (or FIREBASE_SERVICE_ACCOUNT_PATH locally).'
    );
  }

  const json = JSON.parse(readFileSync(path, 'utf8')) as ServiceAccountJson;
  if (!json.project_id || !json.client_email || !json.private_key) {
    throw new Error('Service account JSON is missing project_id / client_email / private_key');
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
  return normalizePrivateKey(json);
}

function normalizePrivateKey(json: ServiceAccountJson): ServiceAccountJson {
  // Vercel env UI often stores newlines as literal \n
  return {
    ...json,
    private_key: json.private_key.includes('\\n')
      ? json.private_key.replace(/\\n/g, '\n')
      : json.private_key,
  };
}

function ensureCredentialsFile(json: ServiceAccountJson) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return;
  const dir = join(tmpdir(), 'force-pulse-sa');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'service-account.json');
  writeFileSync(file, JSON.stringify(normalizePrivateKey(json)), 'utf8');
  process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
}
