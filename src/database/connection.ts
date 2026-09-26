import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env.config.js';

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: env.DB_MAX_POOL,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONN_TIMEOUT_MS
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL Pool Error:', err);
});

export const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (env.NODE_ENV === 'development' && duration > 200) {
      console.warn(`⚠️ Slow query (${duration}ms): ${text.substring(0, 100)}...`);
    }
    return res;
  } catch (error) {
    console.error(`❌ DB Query Error: ${text.substring(0, 120)}`, error);
    throw error;
  }
};

export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const checkDbConnection = async (): Promise<boolean> => {
  try {
    const result = await pool.query('SELECT NOW() as current_time, current_database() as db_name');
    console.log(`✅ Connected to PostgreSQL [${result.rows[0].db_name}] at ${result.rows[0].current_time}`);
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL Connection Failed:', error);
    return false;
  }
};
