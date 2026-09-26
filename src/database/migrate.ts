import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, withTransaction } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log('🚀 Starting PostgreSQL Database Migrations...');

  try {
    // 1. Create migrations tracking table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Fetch already executed migrations
    const executedRes = await pool.query('SELECT migration_name FROM schema_migrations');
    const executedMigrations = new Set(executedRes.rows.map((r: { migration_name: string }) => r.migration_name));

    // 3. Read migration files from migrations directory
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (executedMigrations.has(file)) {
        console.log(`⏩ Skipping already applied migration: ${file}`);
        continue;
      }

      console.log(`⏳ Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      await withTransaction(async (client) => {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (migration_name) VALUES ($1)', [file]);
      });

      console.log(`✅ Successfully applied: ${file}`);
      count++;
    }

    if (count === 0) {
      console.log('✨ All database schemas are already up to date!');
    } else {
      console.log(`🎉 Migrations complete! Successfully applied ${count} new migration(s).`);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
