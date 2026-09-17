import { readFileSync } from 'fs';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

/**
 * Cloud SQL Postgres pool.
 * - Prefer CLOUD_SQL_INSTANCE + PG* (Auth Proxy connector) when public :5432 is blocked.
 * - Else DATABASE_URL / PGHOST direct TCP.
 */
let poolPromise: Promise<Pool> | null = null;

function pgCredentials() {
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE || 'postgres';
  if (!password) {
    throw new Error('Missing PGPASSWORD (or use DATABASE_URL for direct TCP).');
  }
  return { user, password, database };
}

async function createPoolViaConnector(instance: string): Promise<Pool> {
  const keyFile =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (keyFile) {
    // Validate SA JSON early for clearer errors
    const raw = JSON.parse(readFileSync(keyFile, 'utf8')) as { project_id?: string };
    if (!raw.project_id) throw new Error('Invalid service account JSON');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFile;
  }

  const connector = new Connector();
  const clientOpts = await connector.getOptions({
    instanceConnectionName: instance,
    ipType: IpAddressTypes.PUBLIC,
  });
  const { user, password, database } = pgCredentials();
  const pool = new Pool({
    ...clientOpts,
    user,
    password,
    database,
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    keepAlive: true,
  });
  // Keep connector alive for pool lifetime (serverless warm instances).
  (pool as Pool & { __connector?: Connector }).__connector = connector;
  return pool;
}

function createPoolDirect(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  const sslDisabled = process.env.DATABASE_SSL === 'false';
  const base: PoolConfig = {
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    ssl: sslDisabled ? undefined : { rejectUnauthorized: false },
    keepAlive: true,
  };

  if (connectionString) {
    // Avoid pg sslmode=require → verify-full breakage on Cloud SQL
    const url = connectionString
      .replace(/[?&]sslmode=[^&]*/g, '')
      .replace(/\?&/, '?')
      .replace(/[?&]$/, '');
    return new Pool({ ...base, connectionString: url });
  }

  const host = process.env.PGHOST;
  const { user, password, database } = pgCredentials();
  if (!host) {
    throw new Error(
      'Missing CLOUD_SQL_INSTANCE or DATABASE_URL / PGHOST. Set Cloud SQL connection env vars.'
    );
  }
  return new Pool({
    ...base,
    host,
    port: Number(process.env.PGPORT || 5432),
    user,
    password,
    database,
  });
}

async function createPool(): Promise<Pool> {
  const instance = process.env.CLOUD_SQL_INSTANCE?.trim();
  const preferConnector =
    process.env.USE_CLOUD_SQL_CONNECTOR === 'true' ||
    (!!instance && process.env.USE_CLOUD_SQL_CONNECTOR !== 'false');

  const pool = instance && preferConnector
    ? await createPoolViaConnector(instance)
    : createPoolDirect();

  pool.on('error', (err) => {
    console.error('Unexpected Postgres pool error', err);
  });
  return pool;
}

export async function getDbPool(): Promise<Pool> {
  if (!poolPromise) poolPromise = createPool();
  return poolPromise;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const pool = await getDbPool();
  return pool.query<T>(text, params);
}
