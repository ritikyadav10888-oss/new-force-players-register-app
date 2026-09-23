/**
 * Align Cloud SQL admin_users with Firebase Auth for one email.
 * Usage: node scripts/fix-admin-access.mjs <email>
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

const email = (process.argv[2] || 'ritikyadav10888@gmail.com').trim().toLowerCase();

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

let fbUser;
try {
  fbUser = await auth.getUserByEmail(email);
  console.log('Firebase Auth: found uid=' + fbUser.uid);
} catch {
  console.error('Firebase Auth: no user for that email. Create/sign-up first.');
  process.exit(1);
}

const { rows } = await pool.query(
  `SELECT user_id, email, role FROM admin_users
   WHERE lower(coalesce(email,'')) = $1 OR user_id::text = $2`,
  [email, fbUser.uid]
);
console.log('Cloud SQL matches:', rows.length);
for (const r of rows) {
  console.log(`  user_id=${r.user_id} role=${r.role} email=${r.email || '(null)'}`);
}

const byUid = rows.find((r) => String(r.user_id) === fbUser.uid);
if (byUid) {
  await pool.query(
    `UPDATE admin_users SET email = $2, role = COALESCE(NULLIF(role,''), 'superadmin')
     WHERE user_id = $1`,
    [fbUser.uid, email]
  );
  console.log('OK: allowlist already matched Firebase uid; email/role refreshed.');
} else {
  // Remove stale rows for this email, insert correct uid
  await pool.query(`DELETE FROM admin_users WHERE lower(coalesce(email,'')) = $1`, [email]);
  await pool.query(
    `INSERT INTO admin_users (user_id, role, email)
     VALUES ($1, 'superadmin', $2)
     ON CONFLICT (user_id) DO UPDATE SET role = 'superadmin', email = EXCLUDED.email`,
    [fbUser.uid, email]
  );
  console.log('OK: inserted/updated admin_users for Firebase uid.');
}

const check = await pool.query(
  `SELECT user_id, role, email FROM admin_users WHERE user_id = $1`,
  [fbUser.uid]
);
console.log('Final:', check.rows[0]);

await pool.end();
connector.close();
