// Prepara una base PostgreSQL REMOTA (p. ej. Neon) para la demo: crea el rol de aplicación SIN BYPASSRLS,
// aplica migraciones y carga datos FICTICIOS. Usa la conexión DIRECTA (no el pooler).
//
//   ADMIN_DATABASE_URL='postgres://…(directa)…' APP_DB_PASSWORD='…' DEMO_PASSWORD='…' PLATFORM_PASSWORD='…' \
//     npx tsx apps/api/src/remote-setup.ts --yes
import pg from 'pg';
import { migrate } from './migrate.js';
import { seedDemo } from './seed.js';

const need = (k: string, min = 12) => {
  const v = process.env[k];
  if (!v || v.length < min) { console.error(`Falta ${k} (mínimo ${min} caracteres).`); process.exit(1); }
  return v;
};
if (!process.argv.includes('--yes')) { console.error('Añade --yes para confirmar que quieres modificar la base indicada.'); process.exit(1); }
const adminUrl = need('ADMIN_DATABASE_URL', 10);
const appPassword = need('APP_DB_PASSWORD');
const demo = need('DEMO_PASSWORD');
const platform = need('PLATFORM_PASSWORD');
if (/pooler/.test(adminUrl)) { console.error('ADMIN_DATABASE_URL debe ser la conexión DIRECTA (sin "-pooler").'); process.exit(1); }

const c = new pg.Client({ connectionString: adminUrl });
await c.connect();
try {
  const exists = (await c.query(`SELECT 1 FROM pg_roles WHERE rolname = 'botiq_app'`)).rowCount;
  const pw = c.escapeLiteral(appPassword);
  await c.query(exists
    ? `ALTER ROLE botiq_app LOGIN PASSWORD ${pw} NOSUPERUSER NOBYPASSRLS`
    : `CREATE ROLE botiq_app LOGIN PASSWORD ${pw} NOSUPERUSER NOBYPASSRLS`);
  const r = (await c.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'botiq_app'`)).rows[0];
  if (r.rolsuper || r.rolbypassrls) throw new Error('botiq_app tiene privilegios que anulan RLS; abortando.');
  console.log('Rol botiq_app listo (sin SUPERUSER ni BYPASSRLS).');
} finally { await c.end(); }

console.log('Migraciones:', (await migrate(adminUrl)).join(', ') || 'ninguna pendiente');
await seedDemo(adminUrl, demo, platform);
console.log('Datos de demostración (FICTICIOS) cargados.');
