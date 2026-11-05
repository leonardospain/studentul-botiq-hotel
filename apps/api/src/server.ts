import { buildApp } from './app.js';
import { config } from './config.js';
import { assertSafeRole } from './db.js';

await assertSafeRole();
const app = await buildApp();
await app.listen({ port: config.port, host: process.env.HOST ?? '127.0.0.1' }); // por defecto solo local
console.log(`API escuchando en http://${process.env.HOST ?? '127.0.0.1'}:${config.port}`);
