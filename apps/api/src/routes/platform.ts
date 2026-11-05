import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withPlatform } from '../db.js';
import { audit } from '../audit.js';
import { HttpError } from '../errors.js';
import { hashPassword } from '../password.js';
import { requireUser } from '../context.js';

const createHotel = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60),
  city: z.string().max(80).optional(),
  country: z.string().length(2).default('TZ'),
  timezone: z.string().max(60).default('Africa/Dar_es_Salaam'),
  plan_code: z.string().default('starter'),
  owner: z.object({ email: z.string().email(), full_name: z.string().min(2).max(120), password: z.string().min(12).max(200) }),
});

/** Administración central de la plataforma SaaS (solo is_platform_admin). */
export const platformRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req) => {
    if (!requireUser(req).isPlatformAdmin) throw new HttpError(403, 'forbidden');
  });

  app.get('/plans', async (req) => withPlatform(req.user!.id, async (tx) =>
    (await tx.query('SELECT * FROM plans ORDER BY price_usd_cents_month')).rows));

  app.get('/hotels', async (req) => withPlatform(req.user!.id, async (tx) =>
    (await tx.query(
      `SELECT h.id, h.slug, h.name, h.city, h.status, p.code AS plan,
              (SELECT count(*) FROM rooms r WHERE r.hotel_id = h.id)::int AS rooms,
              (SELECT count(*) FROM memberships m WHERE m.hotel_id = h.id AND m.active)::int AS staff
         FROM hotels h JOIN plans p ON p.id = h.plan_id ORDER BY h.created_at`)).rows));

  app.post('/hotels', async (req, reply) => {
    const b = createHotel.parse(req.body);
    const hash = await hashPassword(b.owner.password);
    const out = await withPlatform(req.user!.id, async (tx) => {
      const plan = (await tx.query('SELECT id FROM plans WHERE code = $1', [b.plan_code])).rows[0];
      if (!plan) throw new HttpError(422, 'unknown_plan');
      const hotel = (await tx.query(
        `INSERT INTO hotels(slug, name, city, country, timezone, plan_id, status) VALUES ($1,$2,$3,$4,$5,$6,'trial') RETURNING id, slug, name`,
        [b.slug, b.name, b.city ?? null, b.country, b.timezone, plan.id])).rows[0];
      await tx.query('INSERT INTO subscriptions(hotel_id, plan_id) VALUES ($1,$2)', [hotel.id, plan.id]);
      const u = (await tx.query(
        `INSERT INTO users(email, password_hash, full_name) VALUES ($1,$2,$3)
         ON CONFLICT (email) DO UPDATE SET email = users.email RETURNING id`, [b.owner.email, hash, b.owner.full_name])).rows[0];
      await tx.query(`INSERT INTO memberships(hotel_id, user_id, role) VALUES ($1,$2,'owner')`, [hotel.id, u.id]);
      await audit(tx, { hotelId: hotel.id, userId: req.user!.id, action: 'hotel.create', entity: 'hotel', entityId: hotel.id, data: { slug: b.slug, plan: b.plan_code }, ip: req.ip });
      return hotel;
    });
    return reply.status(201).send(out);
  });

  app.patch('/hotels/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ status: z.enum(['trial', 'active', 'suspended', 'cancelled']).optional(), plan_code: z.string().optional() }).parse(req.body);
    return withPlatform(req.user!.id, async (tx) => {
      if (b.plan_code) {
        const plan = (await tx.query('SELECT id FROM plans WHERE code = $1', [b.plan_code])).rows[0];
        if (!plan) throw new HttpError(422, 'unknown_plan');
        await tx.query('UPDATE hotels SET plan_id = $2 WHERE id = $1', [id, plan.id]);
        await tx.query(`UPDATE subscriptions SET plan_id = $2 WHERE hotel_id = $1`, [id, plan.id]);
      }
      if (b.status) await tx.query('UPDATE hotels SET status = $2 WHERE id = $1', [id, b.status]);
      await audit(tx, { hotelId: id, userId: req.user!.id, action: 'hotel.update', entity: 'hotel', entityId: id, data: b, ip: req.ip });
      return (await tx.query('SELECT id, slug, name, status FROM hotels WHERE id = $1', [id])).rows[0] ?? (() => { throw new HttpError(404, 'not_found'); })();
    });
  });
};
