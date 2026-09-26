import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgrespassword@localhost:5433/remo_tenants';

const isCloudDb = connectionString.includes('neon.tech') || connectionString.includes('sslmode=require');

// Global singleton pool for Next.js hot-reloading
const globalForPg = global as unknown as { pgPool?: Pool };

export const pool = globalForPg.pgPool || new Pool({
  connectionString,
  ssl: isCloudDb ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
});

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgPool = pool;
}

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
}
