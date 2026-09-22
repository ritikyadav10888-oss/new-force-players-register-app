import { readFileSync } from 'fs';
import { Client } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(path.join(root, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1)];
    })
);

const sql = readFileSync(path.join(root, 'firebase/sql/005_owner_id_text.sql'), 'utf8');

const connectionString = String(env.DATABASE_URL || '')
  .replace(/[?&]sslmode=[^&]*/g, '')
  .replace(/\?&/, '?')
  .replace(/[?&]$/, '');

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
const before = await client.query(
  `SELECT data_type FROM information_schema.columns WHERE table_name='tournaments' AND column_name='owner_id'`
);
console.log('before', before.rows[0]);
await client.query(sql);
const after = await client.query(
  `SELECT data_type FROM information_schema.columns WHERE table_name='tournaments' AND column_name='owner_id'`
);
console.log('after', after.rows[0]);
await client.end();
console.log('OK');
