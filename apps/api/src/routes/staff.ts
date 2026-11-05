import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit.js';
import { guard, tenant } from '../context.js';
import { HttpError } from '../errors.js';
import { hashPassword } from '../password.js';
import { ROLES, ROLE_PERMISSIONS } from '../permissions.js';

const uuidParam = z.object({ id: z.string().uuid() });

export const staffRoutes: FastifyPluginAsync = async (app) => {
  // Hotel actual, plan y permisos efectivos del usuario.
  app.get('/me', async (req) => tenant(req, async (tx, hotelId) => {
    const hotel = (await tx.query(
      `SELECT h.id, h.name, h.slug, h.timezone, h.currencies, h.web_languages, h.admin_language, h.status,
              p.code AS plan, p.max_rooms, p.max_staff, (now() AT TIME ZONE h.timezone)::date AS today
         FROM hotels h JOIN plans p ON p.id = h.plan_id WHERE h.id = $1`, [hotelId])).rows[0];
    return { hotel, role: req.hotel!.role, permissions: ROLE_PERMISSIONS[req.hotel!.role] };
  }));

  app.get('/staff', { preHandler: guard('staff:manage') }, async (req) => tenant(req, async (tx) =>
    (await tx.query(
      `SELECT m.id, m.role, m.active, u.id AS user_id, u.email::text AS email, u.full_name
         FROM memberships m JOIN users u ON u.id = m.user_id ORDER BY u.full_name`)).rows));

  app.post('/staff', { preHandler: guard('staff:manage') }, async (req, reply) => {
    const b = z.object({
      email: z.string().email(), full_name: z.string().min(2).max(120),
      role: z.enum(ROLES), password: z.string().min(12).max(200),
    }).parse(req.body);
    const hash = await hashPassword(b.password);
    const out = await tenant(req, async (tx, hotelId, userId) => {
      const lim = (await tx.query(
        `SELECT p.max_staff, (SELECT count(*) FROM memberships WHERE hotel_id = h.id AND active)::int AS n
           FROM hotels h JOIN plans p ON p.id = h.plan_id WHERE h.id = $1`, [hotelId])).rows[0];
      if (lim.n >= lim.max_staff) throw new HttpError(402, 'plan_limit_staff', 'Límite de personal del plan alcanzado');
      // Si el email ya existe se vincula sin tocar su contraseña (no se revela si existía).
      const u = (await tx.query(
        `INSERT INTO users(email, password_hash, full_name) VALUES ($1,$2,$3)
         ON CONFLICT (email) DO UPDATE SET email = users.email RETURNING id`, [b.email, hash, b.full_name])).rows[0];
      const m = (await tx.query(
        'INSERT INTO memberships(hotel_id, user_id, role) VALUES ($1,$2,$3) RETURNING id, role', [hotelId, u.id, b.role])).rows[0];
      await audit(tx, { hotelId, userId, action: 'staff.add', entity: 'membership', entityId: m.id, data: { role: b.role }, ip: req.ip });
      return m;
    });
    return reply.status(201).send(out);
  });

  app.patch('/staff/:id', { preHandler: guard('staff:manage') }, async (req) => {
    const { id } = uuidParam.parse(req.params);
    const b = z.object({ role: z.enum(ROLES).optional(), active: z.boolean().optional() }).parse(req.body);
    return tenant(req, async (tx, hotelId, userId) => {
      const cur = (await tx.query('SELECT role, active FROM memberships WHERE id = $1', [id])).rows[0];
      if (!cur) throw new HttpError(404, 'not_found');
      const role = b.role ?? cur.role, active = b.active ?? cur.active;
      if (cur.role === 'owner' && cur.active && (role !== 'owner' || !active)) {
        const owners = (await tx.query(`SELECT count(*)::int AS n FROM memberships WHERE role='owner' AND active`)).rows[0].n;
        if (owners <= 1) throw new HttpError(409, 'last_owner', 'No se puede quitar al último propietario');
      }
      await tx.query('UPDATE memberships SET role = $2, active = $3 WHERE id = $1', [id, role, active]);
      await audit(tx, { hotelId, userId, action: 'staff.update', entity: 'membership', entityId: id, data: b, ip: req.ip });
      return { id, role, active };
    });
  });

  app.get('/audit', { preHandler: guard('audit:read') }, async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    return tenant(req, async (tx) =>
      (await tx.query('SELECT id, user_id, action, entity, entity_id, data, created_at FROM audit_log ORDER BY id DESC LIMIT $1', [limit])).rows);
  });
};
