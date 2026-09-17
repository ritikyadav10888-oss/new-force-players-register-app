/**
 * Copy player / team images from Supabase Storage (or data: URLs) into Firebase Storage,
 * then update Cloud SQL photo_url / team_logo_url to bare Firebase object paths.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   FIREBASE_SERVICE_ACCOUNT_PATH, Cloud SQL PG* / connector
 *
 * Usage: node scripts/migrate-photos-to-firebase.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import { createClient } from '@supabase/supabase-js';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

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

function extractUploadsPath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-' || trimmed.startsWith('data:')) return null;
  const marker = '/uploads/';
  const idx = trimmed.indexOf(marker);
  if (idx !== -1) {
    let p = trimmed.slice(idx + marker.length);
    const q = p.indexOf('?');
    if (q !== -1) p = p.slice(0, q);
    try {
      p = decodeURIComponent(p.replace(/^\/+/, ''));
    } catch {
      p = p.replace(/^\/+/, '');
    }
    return p || null;
  }
  if (/^https?:\/\//i.test(trimmed)) return null;
  if (trimmed.includes('firebasestorage') || trimmed.includes('googleapis.com')) return null;
  return trimmed.replace(/^\/+/, '');
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], bytes: Buffer.from(m[2], 'base64') };
}

function extForMime(mime) {
  const m = (mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return 'jpg';
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const keyFile =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!supabaseUrl || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
if (!keyFile) {
  console.error('Need FIREBASE_SERVICE_ACCOUNT_PATH');
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
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${sa.project_id}.firebasestorage.app`,
  });
}

const bucket = getStorage().bucket();
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const connector = new Connector();
const opts = await connector.getOptions({
  instanceConnectionName:
    process.env.CLOUD_SQL_INSTANCE ||
    'force-pulse-fa138:asia-south1:force-pulse-fa138-instance',
  ipType: IpAddressTypes.PUBLIC,
});
const pool = new Pool({
  ...opts,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'postgres',
  max: 2,
});

async function downloadFromSupabase(objectPath) {
  const { data, error } = await supabase.storage.from('uploads').download(objectPath);
  if (error || !data) throw new Error(error?.message || 'download failed');
  const ab = await data.arrayBuffer();
  return {
    bytes: Buffer.from(ab),
    mime: data.type || 'image/jpeg',
  };
}

async function uploadFirebase(destPath, bytes, mime) {
  const file = bucket.file(destPath);
  await file.save(bytes, {
    contentType: mime || 'image/jpeg',
    resumable: false,
    metadata: { cacheControl: 'public,max-age=31536000' },
  });
  return destPath;
}

async function migrateValue(oldValue, destPathBase) {
  if (!oldValue || typeof oldValue !== 'string') return null;
  const trimmed = oldValue.trim();
  if (!trimmed || trimmed === '-') return null;

  // Already a bare firebase-style path we own
  if (
    !trimmed.startsWith('http') &&
    !trimmed.startsWith('data:') &&
    (trimmed.startsWith('players/') ||
      trimmed.startsWith('teams/') ||
      trimmed.startsWith('drafts/') ||
      trimmed.startsWith('team-invites/'))
  ) {
    return trimmed;
  }

  if (trimmed.startsWith('data:')) {
    const parsed = parseDataUrl(trimmed);
    if (!parsed) return null;
    const dest = `${destPathBase}.${extForMime(parsed.mime)}`;
    await uploadFirebase(dest, parsed.bytes, parsed.mime);
    return dest;
  }

  const srcPath = extractUploadsPath(trimmed);
  if (!srcPath) {
    // Try fetching the URL directly (expired signed URLs may fail)
    if (/^https?:\/\//i.test(trimmed)) {
      const res = await fetch(trimmed);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
      const mime = res.headers.get('content-type') || 'image/jpeg';
      const bytes = Buffer.from(await res.arrayBuffer());
      const dest = `${destPathBase}.${extForMime(mime)}`;
      await uploadFirebase(dest, bytes, mime);
      return dest;
    }
    return null;
  }

  const { bytes, mime } = await downloadFromSupabase(srcPath);
  const dest = `${destPathBase}.${extForMime(mime)}`;
  await uploadFirebase(dest, bytes, mime);
  return dest;
}

async function migrateTable({ table, idCol, urlCol, destFn }) {
  const selectSql =
    table === 'players'
      ? `SELECT id, photo_url AS url, registration_id
         FROM players
         WHERE photo_url IS NOT NULL AND trim(photo_url::text) <> ''`
      : `SELECT ${idCol} AS id, ${urlCol} AS url
         FROM ${table}
         WHERE ${urlCol} IS NOT NULL AND trim(${urlCol}::text) <> ''`;

  const { rows } = await pool.query(selectSql);

  let ok = 0;
  let fail = 0;
  let skip = 0;

  for (const row of rows) {
    const url = row.url;
    if (
      typeof url === 'string' &&
      !url.includes('supabase') &&
      !url.startsWith('data:') &&
      !/^https?:\/\//i.test(url)
    ) {
      skip += 1;
      continue;
    }

    try {
      const destBase = destFn(row);
      const newPath = await migrateValue(url, destBase);
      if (!newPath) {
        skip += 1;
        continue;
      }
      await pool.query(`UPDATE ${table} SET ${urlCol} = $2 WHERE ${idCol} = $1`, [
        row.id,
        newPath,
      ]);
      ok += 1;
      if (ok % 25 === 0) console.log(`  ${table}: ${ok} migrated...`);
    } catch (err) {
      fail += 1;
      console.error(
        `  fail ${table} ${row.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(`${table}: ok=${ok} fail=${fail} skip=${skip}`);
}

console.log('Migrating images → Firebase Storage...\n');

await migrateTable({
  table: 'players',
  idCol: 'id',
  urlCol: 'photo_url',
  destFn: (row) => `players/${row.registration_id || 'unknown'}/${row.id}`,
});

await migrateTable({
  table: 'team_invite_players',
  idCol: 'id',
  urlCol: 'photo_url',
  destFn: (row) => `team-invites/players/${row.id}`,
});

await migrateTable({
  table: 'registrations',
  idCol: 'id',
  urlCol: 'team_logo_url',
  destFn: (row) => `teams/${row.id}/logo`,
});

console.log('\nDone. New uploads already use Firebase; DB now stores bare paths.');
await pool.end();
connector.close();
