import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { guard, tenant } from '../context.js';
import { isoDate, nightsBetween } from '../dates.js';
import { HttpError } from '../errors.js';
import { hotelToday, RESERVATION_SELECT } from '../pms.js';

export const reportRoutes: FastifyPluginAsync = async (app) => {
  // Llegadas, salidas y alojados de hoy (zona horaria del hotel).
  app.get('/frontdesk', { preHandler: guard('reservations:read') }, async (req) =>
    tenant(req, async (tx, hotelId) => {
      const today = await hotelToday(tx, hotelId);
      const q = async (where: string) => (await tx.query(`${RESERVATION_SELECT} WHERE ${where} ORDER BY rm.number`, [today])).rows;
      return {
        today,
        arrivals: await q(`r.status = 'confirmed' AND r.check_in = $1`),
        departures: await q(`r.status = 'checked_in' AND r.check_out = $1`),
        in_house: await q(`r.status = 'checked_in' AND $1::date IS NOT NULL`),
      };
    }));

  // Ocupación por día: noches-habitación vendidas / habitaciones operativas.
  app.get('/reports/occupancy', { preHandler: guard('reports:read') }, async (req) => {
    const q = z.object({ from: isoDate, to: isoDate }).parse(req.query);
    const days = nightsBetween(q.from, q.to);
    if (days < 1 || days > 366) throw new HttpError(422, 'invalid_range');
    return tenant(req, async (tx) => {
      const rows = (await tx.query(
        `SELECT d.day::date AS date,
                (SELECT count(*) FROM rooms WHERE status = 'available')::int AS rooms,
                (SELECT count(*) FROM reservations x WHERE x.status IN ('confirmed','checked_in','checked_out')
                    AND d.day::date >= x.check_in AND d.day::date < x.check_out)::int AS occupied
           FROM generate_series($1::date, $2::date - 1, interval '1 day') AS d(day) ORDER BY 1`, [q.from, q.to])).rows;
      const sold = rows.reduce((s, r) => s + r.occupied, 0), avail = rows.reduce((s, r) => s + r.rooms, 0);
      return { from: q.from, to: q.to, days: rows.map((r) => ({ ...r, occupancy_pct: r.rooms ? Math.round((r.occupied / r.rooms) * 1000) / 10 : 0 })),
        occupancy_pct: avail ? Math.round((sold / avail) * 1000) / 10 : 0 };
    });
  });

  // Ingresos: cobrado (pagos simulados − reembolsos) y devengado (alojamiento + extras de reservas no canceladas).
  app.get('/reports/revenue', { preHandler: guard('reports:read') }, async (req) => {
    const q = z.object({ from: isoDate, to: isoDate }).parse(req.query);
    return tenant(req, async (tx, hotelId) => {
      // El día contable es el de la zona horaria del hotel, no el UTC del servidor.
      const collected = (await tx.query(
        `SELECT COALESCE(SUM(CASE p.kind WHEN 'payment' THEN p.amount_cents ELSE -p.amount_cents END),0)::int AS cents
           FROM payments p, hotels h WHERE h.id = $3
            AND (p.created_at AT TIME ZONE h.timezone)::date BETWEEN $1::date AND $2::date`, [q.from, q.to, hotelId])).rows[0].cents;
      const lodging = (await tx.query(
        `SELECT COALESCE(SUM(total_cents),0)::int AS cents FROM reservations
          WHERE status IN ('confirmed','checked_in','checked_out') AND check_in >= $1 AND check_in <= $2`, [q.from, q.to])).rows[0].cents;
      const extras = (await tx.query(
        `SELECT COALESCE(SUM(e.quantity * e.unit_price_cents),0)::int AS cents FROM extras e JOIN reservations r ON r.id = e.reservation_id
          WHERE r.status IN ('confirmed','checked_in','checked_out') AND r.check_in >= $1 AND r.check_in <= $2`, [q.from, q.to])).rows[0].cents;
      return { from: q.from, to: q.to, currency: 'USD', simulated_payments: true, collected_cents: collected, lodging_cents: lodging, extras_cents: extras, booked_cents: lodging + extras };
    });
  });
};
