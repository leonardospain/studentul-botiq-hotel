import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { configureApp } from './app-core.js';

export async function buildApp() {
  const app = Fastify({
    logger: false, bodyLimit: 256 * 1024, trustProxy: config.trustProxy,
    // En Vercel el servicio solo recibe /api/*: si el prefijo llegara recortado, se restituye.
    ...(config.onVercel ? { rewriteUrl: (req: { url?: string }) => { const u = req.url ?? '/'; return u === '/api' || u.startsWith('/api/') || u.startsWith('/api?') ? u : `/api${u.startsWith('/') ? u : `/${u}`}`; } } : {}),
  });
  await app.register(cookie);
  await configureApp(app);

  // Interfaz web compilada (apps/web/dist), mismo origen que la API.
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
  if (fs.existsSync(dist)) await app.register(fastifyStatic, { root: dist, wildcard: false });

  return app;
}
