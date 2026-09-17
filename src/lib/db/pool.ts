import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import { ensureGoogleApplicationCredentials } from '@/lib/gcp/credentials';

/**
 * Cloud SQL Postgres pool.
 * - USE_CLOUD_SQL_CONNECTOR=true + CLOUD_SQL_INSTANCE → Auth Proxy connector (needed on Vercel
 *   when public :5432 is not open to the world).
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
  ensureGoogleApplicationCredentials();

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
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 15_000),
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
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 15_000),
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
  // Honor connector when explicitly enabled (Vercel + closed public IP).
  const preferConnector =
    !!instance && process.env.USE_CLOUD_SQL_CONNECTOR === 'true';

  const pool = preferConnector
    ? await createPoolViaConnector(instance!)
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
