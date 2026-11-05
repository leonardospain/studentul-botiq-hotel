import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit.js';
import { isoDate, MAX_NIGHTS, nightsBetween } from '../dates.js';
import { withPlatform, withTenant } from '../db.js';
import { HttpError } from '../errors.js';
import { createReservation, freeRooms, loadReservation, priceStay } from '../pms.js';

const LANGS = ['ro', 'en', 'es', 'it', 'fr'] as const;
const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60) });

// Límite por IP en memoria (por proceso). Evita abuso básico de la reserva pública.
const hits = new Map<string, number[]>();
export const resetPublicLimiter = () => hits.clear();
function limit(key: string, max: number, windowMs = 3_600_000) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, 'too_many_requests');
  arr.push(now);
  hits.set(key, arr);
}

/** Resuelve el hotel por slug. Solo hoteles activos o en prueba son visibles públicamente. */
async function publicHotel(slug: string) {
  const h = await withPlatform(undefined, async (tx) =>
    (await tx.query(
      `SELECT id, slug, name, city, country, currencies, web_languages, public_info
         FROM hotels WHERE slug = $1 AND status IN ('trial','active')`, [slug])).rows[0]);
  if (!h) throw new HttpError(404, 'not_found');
  return h;
}

export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get('/:slug', async (req) => {
    const { slug } = slugParam.parse(req.params);
    const h = await publicHotel(slug);
    const room_types = await withTenant(h.id, undefined, async (tx) => (await tx.query(
      `SELECT id, name, description_i18n, max_adults, max_children, base_rate_cents FROM room_types ORDER BY base_rate_cents`)).rows);
    return { slug: h.slug, name: h.name, city: h.city, country: h.country, languages: h.web_languages, currency: 'USD', info: h.public_info, room_types };
  });

  app.get('/:slug/availability', async (req) => {
    const { slug } = slugParam.parse(req.params);
    limit(`avail|${req.ip}`, 120);
    const q = z.object({ check_in: isoDate, check_out: isoDate,
      adults: z.coerce.number().int().min(1).max(10).default(2), children: z.coerce.number().int().min(0).max(10).default(0) }).parse(req.query);
    const nights = nightsBetween(q.check_in, q.check_out);
    if (nights < 1 || nights > MAX_NIGHTS) throw new HttpError(422, 'invalid_range');
    const h = await publicHotel(slug);
    return withTenant(h.id, undefined, async (tx) => {
      const types = (await tx.query('SELECT id, name, max_adults, max_children FROM room_types WHERE max_adults >= $1 AND max_children >= $2 ORDER BY base_rate_cents', [q.adults, q.children])).rows;
      const free = await freeRooms(tx, q.check_in, q.check_out);
      const out = [];
      for (const t of types) {
        const n = free.filter((r) => r.room_type_id === t.id).length;
        if (n > 0) out.push({ room_type_id: t.id, name: t.name, nights, total_cents: await priceStay(tx, t.id, q.check_in, q.check_out), rooms_left: Math.min(n, 3) });
      }
      return { check_in: q.check_in, check_out: q.check_out, currency: 'USD', room_types: out };
    });
  });

  // Reserva directa con pago SIMULADO del 30 % (no hay pasarela conectada).
  app.post('/:slug/bookings', async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    limit(`book|${req.ip}`, 10);
    const b = z.object({
      room_type_id: z.string().uuid(), check_in: isoDate, check_out: isoDate,
      adults: z.number().int().min(1).max(10), children: z.number().int().min(0).max(10).default(0),
      guest: z.object({ full_name: z.string().trim().min(2).max(120), email: z.string().email().max(254),
        phone: z.string().max(40).optional(), country: z.string().length(2).optional() }),
      language: z.enum(LANGS).default('en'), notes: z.string().max(500).optional(),
      accept_terms: z.literal(true), website: z.string().max(0).optional(), // honeypot
    }).parse(req.body);
    const h = await publicHotel(slug);
    const out = await withTenant(h.id, undefined, async (tx) => {
      const rid = await createReservation(tx, h.id, null, { ...b, source: 'web' }, req.ip);
      const r = await loadReservation(tx, rid);
      const deposit = Math.ceil(r.total_cents * 0.3);
      await tx.query(`INSERT INTO payments(hotel_id, reservation_id, kind, amount_cents, method, reference) VALUES ($1,$2,'payment',$3,'card_simulated','WEB-SIMULATED')`,
        [h.id, rid, deposit]);
      await audit(tx, { hotelId: h.id, action: 'payment.payment', entity: 'reservation', entityId: rid, data: { amount_cents: deposit, method: 'card_simulated', simulated: true }, ip: req.ip });
      return { code: r.code as string, check_in: r.check_in, check_out: r.check_out, room_type: r.room_type_name, total_cents: r.total_cents, deposit_cents: deposit, balance_cents: r.total_cents - deposit, simulated_payment: true };
    });
    return reply.status(201).send(out);
  });

  // Consulta de reserva por código + email (sin datos de otros huéspedes).
  app.get('/:slug/bookings/:code', async (req) => {
    const { slug, code } = z.object({ slug: slugParam.shape.slug, code: z.string().regex(/^BH-[A-Z0-9]{6}$/) }).parse(req.params);
    const { email } = z.object({ email: z.string().email() }).parse(req.query);
    limit(`lookup|${req.ip}`, 30);
    const h = await publicHotel(slug);
    return withTenant(h.id, undefined, async (tx) => {
      const r = (await tx.query(`SELECT r.id FROM reservations r JOIN guests g ON g.id = r.guest_id WHERE r.code = $1 AND lower(g.email) = lower($2)`, [code, email])).rows[0];
      if (!r) throw new HttpError(404, 'not_found');
      const d = await loadReservation(tx, r.id);
      return { code: d.code, status: d.status, check_in: d.check_in, check_out: d.check_out, room_type: d.room_type_name, total_cents: d.total_cents, paid_cents: d.paid_cents, balance_cents: d.balance_cents };
    });
  });
};
