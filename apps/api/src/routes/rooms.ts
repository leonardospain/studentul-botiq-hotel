import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit.js';
import { guard, tenant } from '../context.js';
import { isoDate, MAX_NIGHTS, nightsBetween } from '../dates.js';
import { HttpError } from '../errors.js';
import { freeRooms, priceStay } from '../pms.js';

const id = z.object({ id: z.string().uuid() });
const cents = z.number().int().min(0).max(100_000_00);

export const roomRoutes: FastifyPluginAsync = async (app) => {
  // ---- Tipos de habitación ----
  app.get('/room-types', { preHandler: guard('rooms:read') }, async (req) =>
    tenant(req, async (tx) => (await tx.query('SELECT * FROM room_types ORDER BY base_rate_cents')).rows));

  app.post('/room-types', { preHandler: guard('rooms:write') }, async (req, reply) => {
    const b = z.object({
      name: z.string().min(2).max(80), description: z.string().max(1000).optional(),
      max_adults: z.number().int().min(1).max(10).default(2), max_children: z.number().int().min(0).max(10).default(0),
      base_rate_cents: cents,
    }).parse(req.body);
    const row = await tenant(req, async (tx, hotelId, userId) => {
      const r = (await tx.query(
        `INSERT INTO room_types(hotel_id, name, description, max_adults, max_children, base_rate_cents)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [hotelId, b.name, b.description ?? null, b.max_adults, b.max_children, b.base_rate_cents])).rows[0];
      await audit(tx, { hotelId, userId, action: 'room_type.create', entity: 'room_type', entityId: r.id, data: b, ip: req.ip });
      return r;
    });
    return reply.status(201).send(row);
  });

  app.patch('/room-types/:id', { preHandler: guard('rooms:write') }, async (req) => {
    const { id: rid } = id.parse(req.params);
    const b = z.object({ name: z.string().min(2).max(80).optional(), description: z.string().max(1000).optional(),
      max_adults: z.number().int().min(1).max(10).optional(), max_children: z.number().int().min(0).max(10).optional(),
      base_rate_cents: cents.optional() }).parse(req.body);
    return tenant(req, async (tx, hotelId, userId) => {
      const r = (await tx.query(
        `UPDATE room_types SET name = COALESCE($2,name), description = COALESCE($3,description),
           max_adults = COALESCE($4,max_adults), max_children = COALESCE($5,max_children), base_rate_cents = COALESCE($6,base_rate_cents)
         WHERE id = $1 RETURNING *`, [rid, b.name ?? null, b.description ?? null, b.max_adults ?? null, b.max_children ?? null, b.base_rate_cents ?? null])).rows[0];
      if (!r) throw new HttpError(404, 'not_found');
      await audit(tx, { hotelId, userId, action: 'room_type.update', entity: 'room_type', entityId: rid, data: b, ip: req.ip });
      return r;
    });
  });

  // ---- Habitaciones ----
  app.get('/rooms', { preHandler: guard('rooms:read') }, async (req) =>
    tenant(req, async (tx, hotelId) => {
      const today = (await tx.query(`SELECT (now() AT TIME ZONE timezone)::date AS d FROM hotels WHERE id = $1`, [hotelId])).rows[0].d;
      return (await tx.query(
        `SELECT r.id, r.number, r.floor, r.status, r.housekeeping_status, rt.id AS room_type_id, rt.name AS room_type_name,
                (SELECT x.code FROM reservations x WHERE x.room_id = r.id AND x.status = 'checked_in' LIMIT 1) AS in_house_code,
                (SELECT g.full_name FROM reservations x JOIN guests g ON g.id = x.guest_id
                  WHERE x.room_id = r.id AND x.status = 'checked_in' LIMIT 1) AS in_house_guest
           FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id ORDER BY r.number`, [])).rows
        .map((r) => ({ ...r, today }));
    }));

  app.post('/rooms', { preHandler: guard('rooms:write') }, async (req, reply) => {
    const b = z.object({ number: z.string().min(1).max(10), floor: z.number().int().min(-2).max(50).default(0), room_type_id: z.string().uuid() }).parse(req.body);
    const row = await tenant(req, async (tx, hotelId, userId) => {
      const lim = (await tx.query(
        `SELECT p.max_rooms, (SELECT count(*) FROM rooms WHERE hotel_id = h.id)::int AS n
           FROM hotels h JOIN plans p ON p.id = h.plan_id WHERE h.id = $1`, [hotelId])).rows[0];
      if (lim.n >= lim.max_rooms) throw new HttpError(402, 'plan_limit_rooms', 'Límite de habitaciones del plan alcanzado');
      const r = (await tx.query(
        'INSERT INTO rooms(hotel_id, room_type_id, number, floor) VALUES ($1,$2,$3,$4) RETURNING *', [hotelId, b.room_type_id, b.number, b.floor])).rows[0];
      await audit(tx, { hotelId, userId, action: 'room.create', entity: 'room', entityId: r.id, data: b, ip: req.ip });
      return r;
    });
    return reply.status(201).send(row);
  });

  app.patch('/rooms/:id', { preHandler: guard('rooms:write') }, async (req) => {
    const { id: rid } = id.parse(req.params);
    const b = z.object({ status: z.enum(['available', 'out_of_service']).optional(), floor: z.number().int().min(-2).max(50).optional() }).parse(req.body);
    return tenant(req, async (tx, hotelId, userId) => {
      if (b.status === 'out_of_service') {
        const clash = (await tx.query(
          `SELECT 1 FROM reservations WHERE room_id = $1 AND status IN ('confirmed','checked_in','pending') AND check_out > current_date LIMIT 1`, [rid])).rows[0];
        if (clash) throw new HttpError(409, 'room_has_reservations', 'La habitación tiene reservas activas o futuras');
      }
      const r = (await tx.query(
        'UPDATE rooms SET status = COALESCE($2,status), floor = COALESCE($3,floor) WHERE id = $1 RETURNING *', [rid, b.status ?? null, b.floor ?? null])).rows[0];
      if (!r) throw new HttpError(404, 'not_found');
      await audit(tx, { hotelId, userId, action: 'room.update', entity: 'room', entityId: rid, data: b, ip: req.ip });
      return r;
    });
  });

  // ---- Limpieza ----
  app.patch('/rooms/:id/housekeeping', { preHandler: guard('housekeeping:write') }, async (req) => {
    const { id: rid } = id.parse(req.params);
    const b = z.object({ status: z.enum(['clean', 'dirty', 'in_progress', 'inspected']) }).parse(req.body);
    return tenant(req, async (tx, hotelId, userId) => {
      const r = (await tx.query('UPDATE rooms SET housekeeping_status = $2 WHERE id = $1 RETURNING id, number, housekeeping_status', [rid, b.status])).rows[0];
      if (!r) throw new HttpError(404, 'not_found');
      await audit(tx, { hotelId, userId, action: 'housekeeping.update', entity: 'room', entityId: rid, data: b, ip: req.ip });
      return r;
    });
  });

  // ---- Tarifas por temporada ----
  app.get('/rates', { preHandler: guard('rooms:read') }, async (req) =>
    tenant(req, async (tx) => (await tx.query('SELECT * FROM rate_periods ORDER BY start_date')).rows));

  app.post('/rates', { preHandler: guard('rooms:write') }, async (req, reply) => {
    const b = z.object({ room_type_id: z.string().uuid(), name: z.string().min(1).max(80),
      start_date: isoDate, end_date: isoDate, price_cents: cents }).parse(req.body);
    if (b.end_date <= b.start_date) throw new HttpError(422, 'invalid_range');
    const row = await tenant(req, async (tx, hotelId, userId) => {
      const r = (await tx.query(
        `INSERT INTO rate_periods(hotel_id, room_type_id, name, start_date, end_date, price_cents) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [hotelId, b.room_type_id, b.name, b.start_date, b.end_date, b.price_cents])).rows[0];
      await audit(tx, { hotelId, userId, action: 'rate.create', entity: 'rate_period', entityId: r.id, data: b, ip: req.ip });
      return r;
    });
    return reply.status(201).send(row);
  });

  app.delete('/rates/:id', { preHandler: guard('rooms:write') }, async (req) => {
    const { id: rid } = id.parse(req.params);
    return tenant(req, async (tx, hotelId, userId) => {
      const r = await tx.query('DELETE FROM rate_periods WHERE id = $1', [rid]);
      if (!r.rowCount) throw new HttpError(404, 'not_found');
      await audit(tx, { hotelId, userId, action: 'rate.delete', entity: 'rate_period', entityId: rid, ip: req.ip });
      return { ok: true };
    });
  });

  // ---- Disponibilidad y precio por tipo ----
  app.get('/availability', { preHandler: guard('reservations:read') }, async (req) => {
    const q = z.object({ check_in: isoDate, check_out: isoDate,
      adults: z.coerce.number().int().min(1).max(10).default(1), children: z.coerce.number().int().min(0).max(10).default(0) }).parse(req.query);
    const nights = nightsBetween(q.check_in, q.check_out);
    if (nights < 1 || nights > MAX_NIGHTS) throw new HttpError(422, 'invalid_range');
    return tenant(req, async (tx) => {
      const types = (await tx.query('SELECT * FROM room_types WHERE max_adults >= $1 AND max_children >= $2 ORDER BY base_rate_cents', [q.adults, q.children])).rows;
      const free = await freeRooms(tx, q.check_in, q.check_out);
      const out = [];
      for (const t of types) {
        const rooms = free.filter((r) => r.room_type_id === t.id);
        out.push({
          room_type_id: t.id, name: t.name, available: rooms.length, nights,
          total_cents: await priceStay(tx, t.id, q.check_in, q.check_out), rooms: rooms.map((r) => ({ id: r.id, number: r.number })),
        });
      }
      return { check_in: q.check_in, check_out: q.check_out, currency: 'USD', room_types: out };
    });
  });
};
