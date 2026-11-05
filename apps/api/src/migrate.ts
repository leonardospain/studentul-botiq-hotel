import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';
import { MIGRATIONS } from './migrations.generated.js';

type SqlClient = { query: (text: string, params?: any[]) => Promise<any> };

export async function migrate(url = config.migrateUrl): Promise<string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try { return await migrateWith(client); } finally { await client.end(); }
}

/** Aplica las migraciones con cualquier cliente SQL (pg o PGlite). */
export async function migrateWith(client: SqlClient): Promise<string[]> {
  const applied: string[] = [];
  {
    try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r: { name: string }) => r.name));
    for (const { name: file, sql } of MIGRATIONS) {
      if (done.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migración ${file} falló: ${(e as Error).message}`);
      }
    }
    } finally {
      await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    }
  }
  return applied;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate().then((a) => console.log(a.length ? `Aplicadas: ${a.join(', ')}` : 'Sin migraciones pendientes'))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
