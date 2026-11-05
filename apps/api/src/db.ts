import pg from 'pg';
import { config } from './config.js';

// Las fechas (date) se devuelven como 'YYYY-MM-DD' sin conversión de zona horaria.
pg.types.setTypeParser(1082, (v: string) => v);
// bigint (count, sum) y numeric -> number: los importes caben de sobra en 2^53.
pg.types.setTypeParser(20, (v: string) => Number(v));
pg.types.setTypeParser(1700, (v: string) => Number(v));

export interface Tx { query(text: string, params?: any[]): Promise<{ rows: any[]; rowCount: number | null }> }
export interface DbClient extends Tx { release(): void }
export interface DbPool extends Tx { connect(): Promise<DbClient>; end(): Promise<void> }

export function createPool(url = config.databaseUrl): DbPool {
  return new pg.Pool({ connectionString: url, max: config.dbPoolMax }) as unknown as DbPool;
}

export let pool: DbPool = createPool();
export function setPool(p: DbPool) { pool = p; }

/** Inicializa el motor de datos. En modo pglite crea una PostgreSQL embebida, migra, siembra datos FICTICIOS y activa el rol sin privilegios. */
let initPromise: Promise<void> | undefined;
export function initDb(): Promise<void> {
  if (config.dbDriver !== 'pglite') return Promise.resolve();
  return (initPromise ??= (async () => {
    const { createPglite } = await import('./pglite.js');
    setPool(await createPglite());
  })());
}

type Ctx = { hotelId?: string; userId?: string; platform?: boolean };

/** Ejecuta fn en una transacción con el contexto RLS indicado. Sin contexto => sin acceso a datos de tenant. */
export async function withContext<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.hotel_id', $1, true), set_config('app.user_id', $2, true), set_config('app.platform', $3, true)`,
      [ctx.hotelId ?? '', ctx.userId ?? '', ctx.platform ? 'on' : ''],
    );
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export const withTenant = <T>(hotelId: string, userId: string | undefined, fn: (tx: Tx) => Promise<T>) =>
  withContext({ hotelId, userId }, fn);
export const withUser = <T>(userId: string, fn: (tx: Tx) => Promise<T>) => withContext({ userId }, fn);
export const withPlatform = <T>(userId: string | undefined, fn: (tx: Tx) => Promise<T>) =>
  withContext({ platform: true, userId }, fn);

/** Arranque seguro: el rol de la aplicación no puede ser superusuario ni BYPASSRLS, o RLS no protegería nada. */
export async function assertSafeRole() {
  const { rows } = await pool.query('SELECT current_user AS u, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
  const r = rows[0];
  if (!r || r.rolsuper || r.rolbypassrls)
    throw new Error(`El rol de base de datos "${r?.u}" puede saltarse Row-Level Security. Usa un rol sin SUPERUSER ni BYPASSRLS (ver docs/DEPLOY_DEMO.md).`);
}
