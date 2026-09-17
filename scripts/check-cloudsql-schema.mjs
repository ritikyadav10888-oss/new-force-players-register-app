import fs from 'fs';
import pg from 'pg';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1)];
    })
);
if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = env.FIREBASE_SERVICE_ACCOUNT_PATH;
}

const connector = new Connector();
const opts = await connector.getOptions({
  instanceConnectionName: 'force-pulse-fa138:asia-south1:force-pulse-fa138-instance',
  ipType: IpAddressTypes.PUBLIC,
});
const pool = new pg.Pool({
  ...opts,
  user: env.PGUSER || 'postgres',
  password: env.PGPASSWORD,
  database: env.PGDATABASE || 'postgres',
  max: 1,
});

const tables = await pool.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY 1
`);
const counts = await pool.query(`
  SELECT 'tournaments' AS t, count(*)::int AS n FROM tournaments
  UNION ALL SELECT 'registrations', count(*)::int FROM registrations
  UNION ALL SELECT 'players', count(*)::int FROM players
  UNION ALL SELECT 'payment_orders', count(*)::int FROM payment_orders
  UNION ALL SELECT 'team_invites', count(*)::int FROM team_invites
`);

console.log('database:', env.PGDATABASE || 'postgres');
console.log('tables:', tables.rows.map((r) => r.table_name).join(', '));
console.log('counts:', JSON.stringify(counts.rows));

await pool.end();
connector.close();
