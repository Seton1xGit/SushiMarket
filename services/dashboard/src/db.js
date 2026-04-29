// Postgres connection pool.
// DSN читается из POSTGRES_DSN (Supabase pooler).

import pg from 'pg';

const { Pool } = pg;

if (!process.env.POSTGRES_DSN) {
  console.error('POSTGRES_DSN is not set');
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.POSTGRES_DSN,
  // Supabase pooler даёт self-signed cert — не валидируем.
  ssl: { rejectUnauthorized: false },
  max: 5,
});

pool.on('error', (err) => {
  console.error('postgres pool error:', err.message);
});

export async function q(text, params) {
  const t0 = Date.now();
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (e) {
    console.error('SQL error:', e.message, '\n  query:', text, '\n  params:', params);
    throw e;
  } finally {
    if (Date.now() - t0 > 1000) {
      console.warn(`slow query (${Date.now() - t0} ms):`, text.slice(0, 80));
    }
  }
}
