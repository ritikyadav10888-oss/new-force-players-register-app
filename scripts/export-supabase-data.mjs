/**
 * Export all public app tables from Supabase → firebase/dumps/*.json
 * Usage: node scripts/export-supabase-data.mjs
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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

const TABLES = [
  'tournaments',
  'registrations',
  'players',
  'contact_inquiries',
  'admin_users',
  'payment_orders',
  'pending_registrations',
  'team_invites',
  'team_invite_players',
];

async function fetchAll(db, table) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await db.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase URL or service role key');

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  fs.mkdirSync(DUMP_DIR, { recursive: true });
  const summary = {};

  for (const table of TABLES) {
    process.stdout.write(`Exporting ${table}... `);
    const rows = await fetchAll(db, table);
    fs.writeFileSync(path.join(DUMP_DIR, `${table}.json`), JSON.stringify(rows, null, 2));
    summary[table] = rows.length;
    console.log(`${rows.length} rows`);
  }

  fs.writeFileSync(
    path.join(DUMP_DIR, '_manifest.json'),
    JSON.stringify({ exportedAt: new Date().toISOString(), source: url, tables: summary }, null, 2)
  );
  console.log('\nDone → firebase/dumps/');
  console.log(summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
