// Modo DEMO EFÍMERA: PostgreSQL embebido (PGlite, WASM) dentro del propio proceso.
// Mismas migraciones, RLS, restricciones de exclusión y datos ficticios que con PostgreSQL real.
// Los datos viven en memoria y se pierden al reiniciarse el proceso. NO es para producción.
import { PGlite, types } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { migrateWith } from './migrate.js';
import { seedDemoWith } from './seed.js';
import type { DbClient, DbPool } from './db.js';

const parsers = {
  [types.DATE]: (v: string) => v,          // 'YYYY-MM-DD' sin zona horaria
  [types.INT8]: (v: string) => Number(v),
  [types.NUMERIC]: (v: string) => Number(v),
};

class Mutex {
  private tail: Promise<void> = Promise.resolve();
  async acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((r) => { release = r; });
    const prev = this.tail;
    this.tail = prev.then(() => next);
    await prev;
    return release;
  }
}

export async function createPglite(): Promise<DbPool> {
  const db = new PGlite({ extensions: { btree_gist, citext } });
  await db.waitReady;
  const run = async (text: string, params?: any[]) => {
    if (params && params.length) {
      const r = await db.query<any>(text, params, { parsers });
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    }
    const rs = await db.exec(text, { parsers });
    const last = rs[rs.length - 1];
    return { rows: last?.rows ?? [], rowCount: last?.affectedRows ?? last?.rows?.length ?? 0 };
  };

  // Preparación como superusuario: rol de aplicación, migraciones y datos ficticios.
  await run(`CREATE ROLE botiq_app NOSUPERUSER NOBYPASSRLS`);
  await migrateWith({ query: run });
  const demo = process.env.DEMO_PASSWORD;
  if (!demo || demo.length < 12) throw new Error('DEMO_PASSWORD (mín. 12 caracteres) es obligatoria en modo pglite');
  await seedDemoWith({ query: run }, demo, process.env.PLATFORM_PASSWORD ?? demo);
  // A partir de aquí la aplicación actúa SIN privilegios: RLS se aplica igual que en PostgreSQL real.
  await run(`SET ROLE botiq_app`);

  // PGlite tiene una única sesión: se serializan las transacciones con un mutex.
  const mutex = new Mutex();
  const pool: DbPool = {
    query: async (text, params) => { const rel = await mutex.acquire(); try { return await run(text, params); } finally { rel(); } },
    connect: async (): Promise<DbClient> => {
      const rel = await mutex.acquire();
      let released = false;
      return { query: run, release: () => { if (!released) { released = true; rel(); } } };
    },
    end: async () => { await db.close(); },
  };
  return pool;
}
