/**
 * Provision Firebase Auth users for rows in Cloud SQL admin_users.
 * Preserves existing UUIDs so owner_id / allowlist stay valid.
 *
 * Usage:
 *   set FIREBASE_AUTH_BOOTSTRAP_PASSWORD in .env.local (min 8 chars)
 *   node scripts/provision-firebase-admins.mjs
 *
 * Enable Email/Password in Firebase Console → Authentication first.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const password = process.env.FIREBASE_AUTH_BOOTSTRAP_PASSWORD?.trim();
if (!password || password.length < 8) {
  console.error('Set FIREBASE_AUTH_BOOTSTRAP_PASSWORD (min 8 chars) in .env.local');
  process.exit(1);
}

const keyFile =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyFile) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT_PATH');
  process.exit(1);
}
process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFile;

const sa = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
  });
}
const auth = getAuth();

const connector = new Connector();
const opts = await connector.getOptions({
  instanceConnectionName: 'force-pulse-fa138:asia-south1:force-pulse-fa138-instance',
  ipType: IpAddressTypes.PUBLIC,
});
const pool = new Pool({
  ...opts,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'postgres',
  max: 1,
});

const { rows } = await pool.query(
  `SELECT user_id, email, display_name, role FROM admin_users WHERE email IS NOT NULL`
);

let created = 0;
let updated = 0;
let skipped = 0;

for (const row of rows) {
  const uid = String(row.user_id);
  const email = String(row.email).trim().toLowerCase();
  if (!email) {
    skipped += 1;
    continue;
  }

  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, {
      email,
      password,
      emailVerified: true,
      displayName: row.display_name || undefined,
    });
    updated += 1;
    console.log(`updated ${row.role} ${email}`);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
    if (code !== 'auth/user-not-found') {
      console.error(`fail ${email}:`, err instanceof Error ? err.message : err);
      skipped += 1;
      continue;
    }
    try {
      await auth.createUser({
        uid,
        email,
        password,
        emailVerified: true,
        displayName: row.display_name || undefined,
      });
      created += 1;
      console.log(`created ${row.role} ${email}`);
    } catch (createErr) {
      console.error(
        `create fail ${email}:`,
        createErr instanceof Error ? createErr.message : createErr
      );
      skipped += 1;
    }
  }
}

console.log(`\nDone. created=${created} updated=${updated} skipped=${skipped}`);
console.log('Sign in at /admin/login with the bootstrap password, then change it in Settings.');

await pool.end();
connector.close();
