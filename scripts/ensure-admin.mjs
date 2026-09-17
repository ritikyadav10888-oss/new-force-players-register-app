/**
 * Ensure one admin exists in Cloud SQL + Firebase Auth.
 * Usage: node scripts/ensure-admin.mjs <email> <password>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { randomUUID } from 'crypto';

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

const email = (process.argv[2] || '').trim().toLowerCase();
const password = process.argv[3] || process.env.FIREBASE_AUTH_BOOTSTRAP_PASSWORD || '';
if (!email || !password || password.length < 8) {
  console.error('Usage: node scripts/ensure-admin.mjs <email> <password>');
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

const counts = await pool.query(`SELECT count(*)::int AS n FROM admin_users`);
const withEmail = await pool.query(
  `SELECT count(*)::int AS n FROM admin_users WHERE email IS NOT NULL AND trim(email) <> ''`
);
console.log(`admin_users total=${counts.rows[0].n} with_email=${withEmail.rows[0].n}`);

const existing = await pool.query(
  `SELECT user_id, email, role FROM admin_users WHERE lower(email) = $1 LIMIT 1`,
  [email]
);

let uid;
if (existing.rows[0]) {
  uid = String(existing.rows[0].user_id);
  console.log(`found Cloud SQL admin role=${existing.rows[0].role}`);
} else {
  // Prefer UUID from dump if present for this email
  const dumpPath = path.join(ROOT, 'firebase', 'dumps', 'admin_users.json');
  let dumpUid = null;
  if (fs.existsSync(dumpPath)) {
    const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
    const match = dump.find(
      (r) => typeof r.email === 'string' && r.email.trim().toLowerCase() === email
    );
    if (match?.user_id) dumpUid = String(match.user_id);
  }
  uid = dumpUid || randomUUID();
  await pool.query(
    `INSERT INTO admin_users (user_id, role, email)
     VALUES ($1, 'superadmin', $2)
     ON CONFLICT (user_id) DO UPDATE SET role = 'superadmin', email = EXCLUDED.email`,
    [uid, email]
  );
  console.log(`inserted Cloud SQL superadmin uid=${uid}`);
}

try {
  await auth.getUser(uid);
  await auth.updateUser(uid, { email, password, emailVerified: true });
  console.log('Firebase Auth: updated existing uid');
} catch (err) {
  const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
  if (code === 'auth/user-not-found') {
    // Email might already exist under a different uid
    try {
      const byEmail = await auth.getUserByEmail(email);
      await auth.updateUser(byEmail.uid, { password, emailVerified: true });
      // Keep allowlist aligned to Firebase uid
      if (byEmail.uid !== uid) {
        await pool.query(
          `UPDATE admin_users SET user_id = $1 WHERE lower(email) = $2`,
          [byEmail.uid, email]
        );
        console.log(`aligned Cloud SQL user_id to existing Firebase uid=${byEmail.uid}`);
      }
      console.log('Firebase Auth: password updated for existing email');
    } catch {
      await auth.createUser({ uid, email, password, emailVerified: true });
      console.log('Firebase Auth: created user');
    }
  } else {
    throw err;
  }
}

console.log(`\nOK — sign in at /admin/login as ${email}`);
await pool.end();
connector.close();
