import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { seedDemo, type SeedResult } from '../src/seed.js';
import { pool } from '../src/db.js';
import { resetLoginLimiter } from '../src/routes/auth.js';

export const PASSWORD = 'Demo-Password-123!';
export const OWNER_URL = process.env.MIGRATE_DATABASE_URL!;

export async function resetDb(): Promise<SeedResult> {
  const c = new pg.Client({ connectionString: OWNER_URL });
  await c.connect();
  await c.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO botiq_owner;`).catch(async () => {
    // si el owner no puede borrar el esquema, vacía las tablas conocidas
    throw new Error('No se pudo reiniciar el esquema de test');
  });
  await c.end();
  await migrate(OWNER_URL);
  resetLoginLimiter();
  return seedDemo(OWNER_URL, PASSWORD);
}

export type Client = ReturnType<typeof makeClient>;
export function makeClient(app: FastifyInstance) {
  let cookie = '';
  const call = async (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.inject({ method: method as any, url, payload: body as any, headers: { ...(cookie ? { cookie } : {}), ...headers } });
    const set = res.headers['set-cookie'];
    if (set) {
      const raw = (Array.isArray(set) ? set[0] : set) as string;
      cookie = raw.startsWith('botiq_session=;') || /Max-Age=0|Expires=Thu, 01 Jan 1970/.test(raw) ? '' : raw.split(';')[0];
    }
    let json: any; try { json = res.json(); } catch { json = undefined; }
    return { status: res.statusCode, body: json, headers: res.headers, raw: res.body };
  };
  return {
    get: (u: string, h?: Record<string, string>) => call('GET', u, undefined, h),
    post: (u: string, b?: unknown, h?: Record<string, string>) => call('POST', u, b ?? {}, h),
    patch: (u: string, b?: unknown) => call('PATCH', u, b ?? {}),
    del: (u: string) => call('DELETE', u),
    login: async (email: string, password = PASSWORD) => call('POST', '/api/auth/login', { email, password }),
  };
}

export async function boot() {
  const seed = await resetDb();
  const app = await buildApp();
  return { app, seed, close: async () => { await app.close(); await pool.end(); } };
}

export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const todayUtc = () => new Date().toISOString().slice(0, 10);
