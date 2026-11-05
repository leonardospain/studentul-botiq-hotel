import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit.js';
import { guard, tenant } from '../context.js';
import { isoDate, MAX_NIGHTS, nightsBetween } from '../dates.js';
import { HttpError } from '../errors.js';
import { can } from '../permissions.js';
import { freeRooms, hotelToday, loadReservation, newCode, priceStay, RESERVATION_SELECT } from '../pms.js';

const id = z.object({ id: z.string().uuid() });
const guestInput = z.object({
  full_name: z.string().min(2).max(120), email: z.string().email().max(254).optional(),
  phone: z.string().max(40).optional(), country: z.string().max(2).optional(),
});

async function details(tx: Parameters<typeof loadReservation>[0], rid: string) {
  const r = await loadReservation(tx, rid);
  const payments = (await tx.query('SELECT id, kind, amount_cents, method, simulated, reference, created_at FROM payments WHERE reservation_id = $1 ORDER BY created_at', [rid])).rows;
  const extras = (await tx.query('SELECT id, kind, description, quantity, unit_price_cents, service_date FROM extras WHERE reservation_id = $1 ORDER BY created_at', [rid])).rows;
  return { ...r, payments, extras };
}

export const reservationRoutes: FastifyPluginAsync = async (app) => {
  // ---- Huéspedes ----
  app.get('/guests', { preHandler: guard('guests:read') }, async (req) => {
    const { q } = z.object({ q: z.string().max(100).optional() }).parse(req.query);
    return tenant(req, async (tx) => (await tx.query(
      `SELECT * FROM guests WHERE ($1::text IS NULL OR full_name ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%') ORDER BY full_name LIMIT 100`, [q ?? null])).rows);
  });

  app.post('/guests', { preHandler: guard('guests:write') }, async (req, reply) => {
    const b = guestInput.extend({ notes: z.string().max(1000).optional() }).parse(req.body);
    const row = await tenant(req, async (tx, hotelId, userId) => {
      const g = (await tx.query(
        'INSERT INTO guests(hotel_id, full_name, email, phone, country, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [hotelId, b.full_name, b.email ?? null, b.phone ?? null, b.country ?? null, b.notes ?? null])).rows[0];
      await audit(tx, { hotelId, userId, action: 'guest.create', entity: 'guest', entityId: g.id, ip: req.ip });
      return g;
    });
    return reply.status(201).send(row);
  });

  // ---- Reservas ----
  app.get('/reservations', { preHandler: guard('reservations:read') }, async (req) => {
    const q = z.object({ status: z.string().max(100).optional(), from: isoDate.optional(), to: isoDate.optional(), q: z.string().max(100).optional() }).parse(req.query);
    const statuses = q.status?.split(',').filter(Boolean) ?? null;
    return tenant(req, async (tx) => (await tx.query(
      `${RESERVATION_SELECT}
        WHERE ($1::text[] IS NULL OR r.status = ANY($1))
          AND ($2::date IS NULL OR r.check_out > $2) AND ($3::date IS NULL OR r.check_in <= $3)
          AND ($4::text IS NULL OR r.code ILIKE '%'||$4||'%' OR g.full_name ILIKE '%'||$4||'%')
        ORDER BY r.check_in DESC, r.created_at DESC LIMIT 200`,
      [statuses, q.from ?? null, q.to ?? null, q.q ?? null])).rows);
  });

  app.get('/reservations/:id', { preHandler: guard('reservations:read') }, async (req) => {
    const { id: rid } = id.parse(req.params);
    return tenant(req, (tx) => details(tx, rid));
  });

  app.post('/reservations', { preHandler: guard('reservations:write') }, async (req, reply) => {
    const b = z.object({
      guest_id: z.string().uuid().optional(), guest: guestInput.optional(),
      room_type_id: z.string().uuid(), room_id: z.string().uuid().optional(),
      check_in: isoDate, check_out: isoDate,
      adults: z.number().int().min(1).max(10).default(1), children: z.number().int().min(0).max(10).default(0),
      source: z.enum(['direct', 'web', 'phone', 'walk_in', 'booking_com', 'airbnb', 'other']).default('direct'),
      notes: z.string().max(1000).optional(),
    }).refine((v) => v.guest_id || v.guest, 'guest_id o guest requerido').parse(req.body);
    const nights = nightsBetween(b.check_in, b.check_out);
    if (nights < 1 || nights > MAX_NIGHTS) throw new HttpError(422, 'invalid_range', `La estancia debe ser de 1 a ${MAX_NIGHTS} noches`);

    const out = await tenant(req, async (tx, hotelId, userId) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [hotelId]); // serializa la asignación por hotel
      const today = await hotelToday(tx, hotelId);
      if (b.check_in < today) throw new HttpError(422, 'past_date', 'La entrada no puede ser anterior a hoy');
      const rt = (await tx.query('SELECT max_adults, max_children FROM room_types WHERE id = $1', [b.room_type_id])).rows[0];
      if (!rt) throw new HttpError(422, 'invalid_room_type');
      if (b.adults > rt.max_adults || b.children > rt.max_children) throw new HttpError(422, 'capacity_exceeded');

      const free = await freeRooms(tx, b.check_in, b.check_out, b.room_type_id);
      const room = b.room_id ? free.find((r) => r.id === b.room_id) : free[0];
      if (!room) throw new HttpError(409, 'no_availability', 'No hay habitaciones disponibles para esas fechas');

      let guestId = b.guest_id;
      if (!guestId) {
        const g = b.guest!;
        guestId = (await tx.query(
          'INSERT INTO guests(hotel_id, full_name, email, phone, country) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [hotelId, g.full_name, g.email ?? null, g.phone ?? null, g.country ?? null])).rows[0].id;
      }
      const total = await priceStay(tx, b.room_type_id, b.check_in, b.check_out);
      let rid: string | undefined;
      for (let i = 0; i < 5 && !rid; i++) {
        const ins = await tx.query(
          `INSERT INTO reservations(hotel_id, code, guest_id, room_id, room_type_id, check_in, check_out, adults, children, source, total_cents, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (hotel_id, code) DO NOTHING RETURNING id`,
          [hotelId, newCode(), guestId, room.id, b.room_type_id, b.check_in, b.check_out, b.adults, b.children, b.source, total, b.notes ?? null, userId]);
        rid = ins.rows[0]?.id;
      }
      if (!rid) throw new HttpError(500, 'code_generation_failed');
      await audit(tx, { hotelId, userId, action: 'reservation.create', entity: 'reservation', entityId: rid,
        data: { room: room.number, check_in: b.check_in, check_out: b.check_out, total_cents: total }, ip: req.ip });
      return details(tx, rid);
    });
    return reply.status(201).send(out);
  });

  // Cambiar fechas: recalcula el total y falla con 409 si la habitación ya está ocupada.
  app.patch('/reservations/:id', { preHandler: guard('reservations:write') }, async (req) => {
    const { id: rid } = id.parse(req.params);
    const b = z.object({ check_in: isoDate.optional(), check_out: isoDate.optional(), notes: z.string().max(1000).optional() }).parse(req.body);
    return tenant(req, async (tx, hotelId, userId) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [hotelId]);
      const cur = (await tx.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [rid])).rows[0];
      if (!cur) throw new HttpError(404, 'not_found');
      if (!['pending', 'confirmed', 'checked_in'].includes(cur.status)) throw new HttpError(409, 'invalid_state', 'La reserva ya no es modificable');
      const ci = b.check_in ?? cur.check_in, co = b.check_out ?? cur.check_out;
      if (cur.status === 'checked_in' && ci !== cur.check_in) throw new HttpError(409, 'invalid_state', 'Con el huésped alojado solo se puede cambiar la salida');
      const nights = nightsBetween(ci, co);
      if (nights < 1 || nights > MAX_NIGHTS) throw new HttpError(422, 'invalid_range');
      if (ci !== cur.check_in && ci < (await hotelToday(tx, hotelId))) throw new HttpError(422, 'past_date');
      const total = await priceStay(tx, cur.room_type_id, ci, co);
      await tx.query('UPDATE reservations SET check_in=$2, check_out=$3, total_cents=$4, notes=COALESCE($5,notes), updated_at=now() WHERE id=$1',
        [rid, ci, co, total, b.notes ?? null]);
      await audit(tx, { hotelId, userId, action: 'reservation.update', entity: 'reservation', entityId: rid,
        data: { from: [cur.check_in, cur.check_out], to: [ci, co], total_cents: total }, ip: req.ip });
      return details(tx, rid);
    });
  });

  // Asignar/cambiar habitación (mismo tipo, para no alterar el precio).
  app.post('/reservations/:id/assign-room', { preHandler: guard('reservations:write') }, async (req) => {
    const { id: rid } = id.parse(req.params);
    const { room_id } = z.object({ room_id: z.string().uuid() }).parse(req.body);
    return tenant(req, async (tx, hotelId, userId) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [hotelId]);
      const cur = (await tx.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [rid])).rows[0];
      if (!cur) throw new HttpError(404, 'not_found');
      if (!['pending', 'confirmed'].includes(cur.status)) throw new HttpError(409, 'invalid_state');
      const free = await freeRooms(tx, cur.check_in, cur.check_out, cur.room_type_id, rid);
      if (!free.some((r) => r.id === room_id)) throw new HttpError(409, 'room_unavailable', 'Habitación no disponible o de otro tipo');
      await tx.query('UPDATE reservations SET room_id = $2, updated_at = now() WHERE id = $1', [rid, room_id]);
      await audit(tx, { hotelId, userId, action: 'reservation.assign_room', entity: 'reservation', entityId: rid, data: { from: cur.room_id, to: room_id }, ip: req.ip });
      return details(tx, rid);
    });
  });

  app.post('/reservations/:id/check-in', { preHandler: guard('reservations:write') }, async (req) => {
    const { id: rid } = id.parse(req.params);
    return tenant(req, async (tx, hotelId, userId) => {
      const cur = (await tx.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [rid])).rows[0];
      if (!cur) throw new HttpError(404, 'not_found');
      if (cur.status !== 'confirmed') throw new HttpError(409, 'invalid_state', 'Solo se puede registrar la entrada de reservas confirmadas');
      const today = await hotelToday(tx, hotelId);
      if (today < cur.check_in) throw new HttpError(409, 'too_early', 'Aún no es la fecha de entrada');
      if (today >= cur.check_out) throw new HttpError(409, 'stay_over', 'La estancia ya terminó');
      const room = (await tx.query('SELECT status, housekeeping_status, number FROM rooms WHERE id = $1', [cur.room_id])).rows[0];
      if (room.status !== 'available' || !['clean', 'inspected'].includes(room.housekeeping_status))
        throw new HttpError(409, 'room_not_ready', `La habitación ${room.number} no está lista (limpieza: ${room.housekeeping_status})`);
      await tx.query(`UPDATE reservations SET status='checked_in', checked_in_at=now(), updated_at=now() WHERE id=$1`, [rid]);
      await audit(tx, { hotelId, userId, action: 'reservation.check_in', entity: 'reservation', entityId: rid, ip: req.ip });
      return details(tx, rid);
    });
  });

  app.post('/reservations/:id/check-out', { preHandler: guard('reservations:write') }, async (req) => {
    const { id: rid } = id.parse(req.params);
    const b = z.object({ allow_balance: z.boolean().default(false) }).parse(req.body ?? {});
    return tenant(req, async (tx, hotelId, userId) => {
      const cur = (await tx.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [rid])).rows[0];
      if (!cur) throw new HttpError(404, 'not_found');
      if (cur.status !== 'checked_in') throw new HttpError(409, 'invalid_state', 'La reserva no está alojada');
      const r = await loadReservation(tx, rid);
      if (r.balance_cents > 0) {
        if (!(b.allow_balance && can(req.hotel!.role, 'reservations:override')))
          throw new HttpError(409, 'balance_due', `Saldo pendiente: ${r.balance_cents} centavos USD`);
      }
      await tx.query(`UPDATE reservations SET status='checked_out', checked_out_at=now(), updated_at=now() WHERE id=$1`, [rid]);
      await tx.query(`UPDATE rooms SET housekeeping_status='dirty' WHERE id=$1`, [cur.room_id]);
      await audit(tx, { hotelId, userId, action: 'reservation.check_out', entity: 'reservation', entityId: rid,
        data: { balance_cents: r.balance_cents, overridden: r.balance_cents > 0 }, ip: req.ip });
      return details(tx, rid);
    });
  });

  app.post('/reservations/:id/cancel', { preHandler: guard('reservations:write') }, async (req) => {
    const { id: rid } = id.parse(req.params);
    const b = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
    return tenant(req, async (tx, hotelId, userId) => {
      const cur = (await tx.query('SELECT status FROM reservations WHERE id = $1 FOR UPDATE', [rid])).rows[0];
      if (!cur) throw new HttpError(404, 'not_found');
      if (!['pending', 'confirmed'].includes(cur.status)) throw new HttpError(409, 'invalid_state', 'Solo se cancelan reservas pendientes o confirmadas');
      await tx.query(`UPDATE reservations SET status='cancelled', updated_at=now() WHERE id=$1`, [rid]);
      await audit(tx, { hotelId, userId, action: 'reservation.cancel', entity: 'reservation', entityId: rid, data: b, ip: req.ip });
      return details(tx, rid);
    });
  });

  // ---- Pagos SIMULADOS y extras ----
  app.post('/reservations/:id/payments', { preHandler: guard('payments:write') }, async (req, reply) => {
    const { id: rid } = id.parse(req.params);
    const b = z.object({ amount_cents: z.number().int().min(1).max(100_000_00), method: z.enum(['cash', 'card_simulated', 'transfer']),
      kind: z.enum(['payment', 'refund']).default('payment'), reference: z.string().max(100).optional() }).parse(req.body);
    const out = await tenant(req, async (tx, hotelId, userId) => {
      const cur = (await tx.query('SELECT status FROM reservations WHERE id = $1 FOR UPDATE', [rid])).rows[0];
      if (!cur) throw new HttpError(404, 'not_found');
      const r = await loadReservation(tx, rid);
      if (b.kind === 'payment') {
        if (cur.status === 'cancelled') throw new HttpError(409, 'invalid_state', 'Reserva cancelada');
        if (b.amount_cents > r.balance_cents) throw new HttpError(422, 'overpayment', 'El pago supera el saldo pendiente');
      } else if (b.amount_cents > r.paid_cents) throw new HttpError(422, 'refund_exceeds_paid');
      await tx.query('INSERT INTO payments(hotel_id, reservation_id, kind, amount_cents, method, reference, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [hotelId, rid, b.kind, b.amount_cents, b.method, b.reference ?? null, userId]);
      await audit(tx, { hotelId, userId, action: `payment.${b.kind}`, entity: 'reservation', entityId: rid, data: { amount_cents: b.amount_cents, method: b.method, simulated: true }, ip: req.ip });
      return details(tx, rid);
    });
    return reply.status(201).send(out);
  });

  app.post('/reservations/:id/extras', { preHandler: guard('extras:write') }, async (req, reply) => {
    const { id: rid } = id.parse(req.params);
    const b = z.object({ kind: z.enum(['excursion', 'transfer', 'restaurant', 'other']), description: z.string().min(2).max(200),
      quantity: z.number().int().min(1).max(100).default(1), unit_price_cents: z.number().int().min(0).max(10_000_00), service_date: isoDate.optional() }).parse(req.body);
    const out = await tenant(req, async (tx, hotelId, userId) => {
      const cur = (await tx.query('SELECT status FROM reservations WHERE id = $1 FOR UPDATE', [rid])).rows[0];
      if (!cur) throw new HttpError(404, 'not_found');
      if (!['pending', 'confirmed', 'checked_in'].includes(cur.status)) throw new HttpError(409, 'invalid_state');
      await tx.query('INSERT INTO extras(hotel_id, reservation_id, kind, description, quantity, unit_price_cents, service_date, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [hotelId, rid, b.kind, b.description, b.quantity, b.unit_price_cents, b.service_date ?? null, userId]);
      await audit(tx, { hotelId, userId, action: 'extra.add', entity: 'reservation', entityId: rid, data: b, ip: req.ip });
      return details(tx, rid);
    });
    return reply.status(201).send(out);
  });
};
