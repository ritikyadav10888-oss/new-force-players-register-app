/**
 * Apply firebase/sql/002_full_schema.sql then import firebase/dumps/*.json
 * via Cloud SQL Node Connector (works when public :5432 is firewalled).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import { GoogleAuth } from 'google-auth-library';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DUMP_DIR = path.join(ROOT, 'firebase', 'dumps');
const SCHEMA_FILES = [
  'firebase/sql/002_full_schema.sql',
  'firebase/sql/003_admin_users_columns.sql',
  'firebase/sql/004_tournaments_owner_id.sql',
];

const INSTANCE = 'force-pulse-fa138:asia-south1:force-pulse-fa138-instance';

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

async function applySchema(pool) {
  for (const rel of SCHEMA_FILES) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    console.log(`Applying ${rel}...`);
    await pool.query(fs.readFileSync(file, 'utf8'));
  }
  console.log('Schema OK');
}

async function importTable(pool, table) {
  const file = path.join(DUMP_DIR, `${table}.json`);
  if (!fs.existsSync(file)) {
    console.log(`skip ${table}`);
    return;
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const colRes = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  const allowed = new Set(colRes.rows.map((r) => r.column_name));
  let n = 0;
  let skippedCols = new Set();
  for (const row of rows) {
    if (table === 'admin_users' && row.user_id != null) row.user_id = String(row.user_id);
    const cols = Object.keys(row).filter((c) => {
      if (allowed.has(c)) return true;
      skippedCols.add(c);
      return false;
    });
    if (!cols.length) continue;
    const values = cols.map((c) => sqlLiteral(row[c]));
    await pool.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING`
    );
    n += 1;
  }
  if (skippedCols.size) {
    console.log(`${table}: skipped columns → ${[...skippedCols].join(', ')}`);
  }
  console.log(`${table}: ${n}`);
}

async function main() {
  loadEnvLocal();
  const keyFile =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const auth = new GoogleAuth({
    keyFile,
    scopes: [
      'https://www.googleapis.com/auth/sqlservice.admin',
      'https://www.googleapis.com/auth/cloud-platform',
    ],
  });
  const connector = new Connector({ auth });
  const clientOpts = await connector.getOptions({
    instanceConnectionName: INSTANCE,
    ipType: IpAddressTypes.PUBLIC,
  });
  const pool = new Pool({
    ...clientOpts,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'postgres',
    max: 2,
  });

  try {
    await applySchema(pool);
    for (const table of TABLES) {
      await importTable(pool, table);
    }
    const counts = await pool.query(`
      SELECT 'tournaments' AS t, count(*)::int AS n FROM tournaments
      UNION ALL SELECT 'registrations', count(*)::int FROM registrations
      UNION ALL SELECT 'players', count(*)::int FROM players
      UNION ALL SELECT 'payment_orders', count(*)::int FROM payment_orders
      UNION ALL SELECT 'team_invites', count(*)::int FROM team_invites
      UNION ALL SELECT 'team_invite_players', count(*)::int FROM team_invite_players
      UNION ALL SELECT 'admin_users', count(*)::int FROM admin_users
    `);
    console.log('\nCloud SQL row counts:');
    console.table(counts.rows);
  } finally {
    await pool.end();
    connector.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
