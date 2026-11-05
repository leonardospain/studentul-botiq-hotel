// Punto de entrada para Vercel Functions (NO VERIFICADO en Vercel: ver docs/DEPLOY_DEMO.md).
// Todas las rutas /api/* se reescriben a esta función (vercel.json).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../apps/api/src/app.js';
import { assertSafeRole } from '../apps/api/src/db.js';

let ready: Promise<Awaited<ReturnType<typeof buildApp>>> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= (async () => { await assertSafeRole(); const app = await buildApp(); await app.ready(); return app; })();
  try {
    const app = await ready;
    app.server.emit('request', req, res);
  } catch (e) {
    ready = undefined; // permitir reintento tras un fallo de arranque
    console.error(e);
    res.statusCode = 500; res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'startup_failed' }));
  }
}
