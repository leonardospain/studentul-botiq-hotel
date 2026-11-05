import crypto from 'node:crypto';
import { pool } from './db.js';
import { config } from './config.js';

export const COOKIE = 'botiq_session';
export type SessionUser = { id: string; email: string; fullName: string; locale: string; isPlatformAdmin: boolean };

const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export async function createSession(userId: string, ip?: string, userAgent?: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO sessions(user_id, token_hash, expires_at, ip, user_agent) VALUES ($1,$2, now() + make_interval(days => $3), $4, $5)`,
    [userId, hashToken(token), config.sessionDays, ip ?? null, userAgent?.slice(0, 200) ?? null],
  );
  return token;
}

export async function loadSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.email::text AS email, u.full_name, u.locale, u.is_platform_admin
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
    [hashToken(token)],
  );
  const r = rows[0];
  return r ? { id: r.id, email: r.email, fullName: r.full_name, locale: r.locale, isPlatformAdmin: r.is_platform_admin } : null;
}

export async function destroySession(token: string | undefined) {
  if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}
