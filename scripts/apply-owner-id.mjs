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

await pool.query(fs.readFileSync('firebase/sql/004_tournaments_owner_id.sql', 'utf8'));
console.log('004 applied');

const rows = JSON.parse(fs.readFileSync('firebase/dumps/tournaments.json', 'utf8'));
let n = 0;
for (const r of rows) {
  if (!r.id) continue;
  await pool.query('UPDATE tournaments SET owner_id = $1 WHERE id = $2', [
    r.owner_id || null,
    r.id,
  ]);
  n += 1;
}
console.log('owner_id backfilled', n);

const check = await pool.query(
  'SELECT name, (owner_id IS NOT NULL) AS has_owner FROM tournaments ORDER BY name'
);
console.table(check.rows);

await pool.end();
connector.close();
