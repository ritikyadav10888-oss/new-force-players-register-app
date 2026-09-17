/**
 * Import firebase/dumps/*.json into Cloud SQL Postgres.
 * Usage:
 *   1. Set DATABASE_URL in .env.local
 *   2. Apply schema: psql "$DATABASE_URL" -f firebase/sql/002_full_schema.sql
 *   3. node scripts/import-cloudsql-data.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DUMP_DIR = path.join(ROOT, 'firebase', 'dumps');

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) throw new Error('Missing .env.local');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

/** Insert order respects FKs */
const TABLES = [
  'tournaments',
  'registrations',
  'players',
  'contact_inquiries',
  'admin_users',
  'team_invites',
  'team_invite_players',
  'payment_orders',
  'pending_registrations',
];

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function importTable(pool, table) {
  const file = path.join(DUMP_DIR, `${table}.json`);
  if (!fs.existsSync(file)) {
    console.log(`skip ${table} (no dump)`);
    return 0;
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!rows.length) {
    console.log(`${table}: 0 rows`);
    return 0;
  }

  let inserted = 0;
  for (const row of rows) {
    if (table === 'admin_users' && row.user_id != null) {
      row.user_id = String(row.user_id);
    }
    const cols = Object.keys(row);
    const values = cols.map((c) => sqlLiteral(row[c]));
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING`;
    await pool.query(sql);
    inserted += 1;
  }
  console.log(`${table}: ${inserted} rows`);
  return inserted;
}

async function main() {
  loadEnvLocal();
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL missing. Create Cloud SQL Postgres for force-pulse-fa138, then set DATABASE_URL in .env.local.'
    );
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false },
    max: 3,
  });

  try {
    for (const table of TABLES) {
      await importTable(pool, table);
    }
    console.log('\nImport finished.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
