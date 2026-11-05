import { buildApp } from './app.js';
import { config } from './config.js';
import { assertSafeRole, initDb } from './db.js';

await initDb();
await assertSafeRole();
const app = await buildApp();
// En Vercel se escucha en todas las interfaces (Vercel gestiona el puerto); en local, solo en 127.0.0.1.
const host = process.env.HOST ?? (config.onVercel ? '0.0.0.0' : '127.0.0.1');
await app.listen({ port: config.port, host });
console.log(`API escuchando en http://${host}:${config.port}`);
