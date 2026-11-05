import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { withContext, withUser, pool } from '../db.js';
import { audit } from '../audit.js';
import { HttpError } from '../errors.js';
import { DUMMY_HASH, verifyPassword } from '../password.js';
import { COOKIE, createSession, destroySession } from '../session.js';
import { requireUser } from '../context.js';

// Límite de intentos en memoria (por proceso). Para varias instancias habrá que moverlo a Redis/BD.
const attempts = new Map<string, { n: number; first: number }>();
const WINDOW_MS = 15 * 60_000, MAX_ATTEMPTS = 5;
export const resetLoginLimiter = () => attempts.clear();

const body = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

async function membershipsOf(userId: string) {
  return withUser(userId, async (tx) =>
    (await tx.query(
      `SELECT h.id AS hotel_id, h.name, h.slug, m.role FROM memberships m JOIN hotels h ON h.id = m.hotel_id
        WHERE m.user_id = $1 AND m.active ORDER BY h.name`, [userId])).rows);
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (req, reply) => {
    const { email, password } = body.parse(req.body);
    const key = `${req.ip}|${email.toLowerCase()}`;
    const rec = attempts.get(key);
    if (rec && Date.now() - rec.first < WINDOW_MS && rec.n >= MAX_ATTEMPTS) throw new HttpError(429, 'too_many_attempts');

    const { rows } = await pool.query(
      'SELECT id, password_hash, full_name, email::text AS email, locale, is_platform_admin FROM users WHERE email = $1 AND active', [email]);
    const user = rows[0];
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) {
      const fresh = !rec || Date.now() - rec.first >= WINDOW_MS;
      attempts.set(key, { n: fresh ? 1 : rec!.n + 1, first: fresh ? Date.now() : rec!.first });
      await withContext({}, (tx) => audit(tx, { action: 'auth.login_failed', data: { email }, ip: req.ip }));
      throw new HttpError(401, 'invalid_credentials');
    }
    attempts.delete(key);
    const token = await createSession(user.id, req.ip, req.headers['user-agent']);
    await withContext({ userId: user.id }, (tx) => audit(tx, { userId: user.id, action: 'auth.login', ip: req.ip }));
    reply.setCookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/', maxAge: config.sessionDays * 86400,
    });
    return {
      user: { id: user.id, email: user.email, fullName: user.full_name, locale: user.locale, isPlatformAdmin: user.is_platform_admin },
      memberships: await membershipsOf(user.id),
    };
  });

  app.post('/logout', async (req, reply) => {
    await destroySession(req.cookies[COOKIE]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/me', async (req) => {
    const user = requireUser(req);
    return { user, memberships: await membershipsOf(user.id) };
  });
};
