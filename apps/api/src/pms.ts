import type { Tx } from './db.js';
import { HttpError } from './errors.js';
import { audit } from './audit.js';
import { MAX_NIGHTS, nightsBetween } from './dates.js';

export const ACTIVE = `('pending','confirmed','checked_in')`;

/** Total de la estancia: suma por noche de la tarifa de temporada (si existe) o la tarifa base. */
export async function priceStay(tx: Tx, roomTypeId: string, checkIn: string, checkOut: string): Promise<number> {
  const { rows } = await tx.query(
    `SELECT COALESCE(SUM(COALESCE(rp.price_cents, rt.base_rate_cents)), 0)::int AS total
       FROM room_types rt
       CROSS JOIN LATERAL generate_series($2::date, $3::date - 1, interval '1 day') AS d(day)
       LEFT JOIN rate_periods rp ON rp.room_type_id = rt.id AND d.day::date >= rp.start_date AND d.day::date < rp.end_date
      WHERE rt.id = $1`,
    [roomTypeId, checkIn, checkOut],
  );
  return rows[0].total;
}

/** Habitaciones libres (operativas y sin reserva activa solapada) en [checkIn, checkOut). */
export async function freeRooms(tx: Tx, checkIn: string, checkOut: string, roomTypeId?: string, excludeReservationId?: string) {
  const { rows } = await tx.query(
    `SELECT r.id, r.number, r.room_type_id FROM rooms r
      WHERE r.status = 'available'
        AND ($3::uuid IS NULL OR r.room_type_id = $3)
        AND NOT EXISTS (
          SELECT 1 FROM reservations x
           WHERE x.room_id = r.id AND x.status IN ${ACTIVE}
             AND ($4::uuid IS NULL OR x.id <> $4)
             AND daterange(x.check_in, x.check_out, '[)') && daterange($1::date, $2::date, '[)'))
      ORDER BY r.number`,
    [checkIn, checkOut, roomTypeId ?? null, excludeReservationId ?? null],
  );
  return rows as { id: string; number: string; room_type_id: string }[];
}

export async function hotelToday(tx: Tx, hotelId: string): Promise<string> {
  const { rows } = await tx.query(`SELECT (now() AT TIME ZONE timezone)::date AS d FROM hotels WHERE id = $1`, [hotelId]);
  if (!rows[0]) throw new HttpError(404, 'not_found');
  return rows[0].d;
}

export const RESERVATION_SELECT = `
  SELECT r.id, r.code, r.status, r.source, r.check_in, r.check_out, r.adults, r.children, r.notes,
         r.total_cents, r.currency, r.checked_in_at, r.checked_out_at, r.created_at,
         g.id AS guest_id, g.full_name AS guest_name, g.email AS guest_email, g.phone AS guest_phone,
         rm.id AS room_id, rm.number AS room_number, rt.id AS room_type_id, rt.name AS room_type_name,
         COALESCE((SELECT SUM(CASE p.kind WHEN 'payment' THEN p.amount_cents ELSE -p.amount_cents END) FROM payments p
                    WHERE p.reservation_id = r.id), 0)::int AS paid_cents,
         COALESCE((SELECT SUM(e.quantity * e.unit_price_cents) FROM extras e WHERE e.reservation_id = r.id), 0)::int AS extras_cents
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN rooms rm ON rm.id = r.room_id
    JOIN room_types rt ON rt.id = r.room_type_id`;

export type ReservationRow = {
  id: string; status: string; total_cents: number; paid_cents: number; extras_cents: number; [k: string]: unknown;
};

export async function loadReservation(tx: Tx, id: string): Promise<ReservationRow & { balance_cents: number }> {
  const r = (await tx.query(`${RESERVATION_SELECT} WHERE r.id = $1`, [id])).rows[0];
  if (!r) throw new HttpError(404, 'not_found');
  return { ...r, balance_cents: r.total_cents + r.extras_cents - r.paid_cents };
}

export function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'BH-';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export type NewReservation = {
  guest_id?: string;
  guest?: { full_name: string; email?: string; phone?: string; country?: string };
  room_type_id: string; room_id?: string;
  check_in: string; check_out: string; adults: number; children: number;
  source: string; notes?: string; language?: string;
};

/** Crea una reserva con asignación automática de habitación. Debe ejecutarse dentro de un tenant. */
export async function createReservation(tx: Tx, hotelId: string, userId: string | null, b: NewReservation, ip?: string): Promise<string> {
  const nights = nightsBetween(b.check_in, b.check_out);
  if (nights < 1 || nights > MAX_NIGHTS) throw new HttpError(422, 'invalid_range', `La estancia debe ser de 1 a ${MAX_NIGHTS} noches`);
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
      `INSERT INTO reservations(hotel_id, code, guest_id, room_id, room_type_id, check_in, check_out, adults, children, source, total_cents, notes, created_by, guest_language)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (hotel_id, code) DO NOTHING RETURNING id`,
      [hotelId, newCode(), guestId, room.id, b.room_type_id, b.check_in, b.check_out, b.adults, b.children, b.source, total, b.notes ?? null, userId, b.language ?? null]);
    rid = ins.rows[0]?.id;
  }
  if (!rid) throw new HttpError(500, 'code_generation_failed');
  await audit(tx, { hotelId, userId, action: 'reservation.create', entity: 'reservation', entityId: rid,
    data: { room: room.number, check_in: b.check_in, check_out: b.check_out, total_cents: total, source: b.source }, ip });
  return rid;
}
