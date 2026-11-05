import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { COOKIE, loadSession } from './session.js';
import { resolveHotel } from './context.js';
import { authRoutes } from './routes/auth.js';
import { platformRoutes } from './routes/platform.js';
import { staffRoutes } from './routes/staff.js';
import { roomRoutes } from './routes/rooms.js';
import { reservationRoutes } from './routes/reservations.js';
import { reportRoutes } from './routes/reports.js';
import { publicRoutes } from './routes/public.js';

export async function buildApp() {
  const app = Fastify({
    logger: false, bodyLimit: 256 * 1024, trustProxy: config.trustProxy,
    // En Vercel el servicio solo recibe /api/*: si el prefijo llegara recortado, se restituye.
    ...(config.onVercel ? { rewriteUrl: (req: { url?: string }) => { const u = req.url ?? '/'; return u === '/api' || u.startsWith('/api/') || u.startsWith('/api?') ? u : `/api${u.startsWith('/') ? u : `/${u}`}`; } } : {}),
  });
  await app.register(cookie);
  app.decorateRequest('user', null);
  app.decorateRequest('hotel', null);

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('cache-control', 'no-store');
    reply.header('content-security-policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  });

  // Defensa CSRF: además de SameSite=Lax, las mutaciones con cabecera Origin deben venir de un origen permitido.
  app.addHook('onRequest', async (req) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      // Mismo origen que el servidor (Origin.host == Host) o lista explícita; cualquier otro origen se rechaza.
      let sameOrigin = false;
      try { sameOrigin = !!origin && new URL(origin).host === req.headers.host; } catch { /* origen inválido */ }
      if (origin && !sameOrigin && !config.allowedOrigins.includes(origin)) throw new HttpError(403, 'origin_not_allowed');
    }
    req.user = await loadSession(req.cookies[COOKIE]);
  });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) return reply.status(400).send({ error: 'validation', issues: err.issues });
    if (err?.code === '23P01') return reply.status(409).send({ error: 'conflict', message: 'La habitación ya está ocupada en esas fechas' });
    if (err?.code === '23505') return reply.status(409).send({ error: 'duplicate' });
    if (err?.code === '23503') return reply.status(422).send({ error: 'invalid_reference' });
    if (err?.code === '23514') return reply.status(422).send({ error: 'constraint_violation', message: err.constraint });
    if (err?.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: err.code ?? 'bad_request' });
    console.error(err);
    return reply.status(500).send({ error: 'internal' });
  });

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(platformRoutes, { prefix: '/api/platform' });
  await app.register(publicRoutes, { prefix: '/api/public' });
  await app.register(async (h) => {
    h.addHook('preHandler', resolveHotel);
    await h.register(staffRoutes);
    await h.register(roomRoutes);
    await h.register(reservationRoutes);
    await h.register(reportRoutes);
  }, { prefix: '/api/h/:hotelId' });

  // Interfaz web compilada (apps/web/dist), mismo origen que la API.
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
  if (fs.existsSync(dist)) await app.register(fastifyStatic, { root: dist, wildcard: false });

  return app;
}
