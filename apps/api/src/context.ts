import type { FastifyReply, FastifyRequest } from 'fastify';
import { withTenant, withUser, type Tx } from './db.js';
import { HttpError } from './errors.js';
import { can, type Permission, type Role } from './permissions.js';
import type { SessionUser } from './session.js';

export type HotelAccess = { id: string; role: Role; viaPlatform: boolean };

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    hotel: HotelAccess | null;
  }
}

export function requireUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw new HttpError(401, 'unauthenticated');
  return req.user;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** preHandler de las rutas /api/h/:hotelId/*: valida sesión y pertenencia al hotel. */
export async function resolveHotel(req: FastifyRequest, _reply: FastifyReply) {
  const user = requireUser(req);
  const hotelId = (req.params as { hotelId?: string }).hotelId ?? '';
  if (!UUID.test(hotelId)) throw new HttpError(403, 'forbidden');
  const row = await withUser(user.id, async (tx) =>
    (await tx.query('SELECT role FROM memberships WHERE hotel_id = $1 AND user_id = $2 AND active', [hotelId, user.id])).rows[0],
  );
  if (row) req.hotel = { id: hotelId, role: row.role, viaPlatform: false };
  else if (user.isPlatformAdmin) req.hotel = { id: hotelId, role: 'owner', viaPlatform: true };
  else throw new HttpError(403, 'forbidden'); // mismo error exista o no el hotel
}

export const guard = (perm: Permission) => async (req: FastifyRequest) => {
  if (!req.hotel) throw new HttpError(403, 'forbidden');
  if (!can(req.hotel.role, perm)) throw new HttpError(403, 'forbidden', `missing permission ${perm}`);
};

/** Ejecuta fn dentro del tenant de la petición (RLS activo). */
export function tenant<T>(req: FastifyRequest, fn: (tx: Tx, hotelId: string, userId: string) => Promise<T>): Promise<T> {
  if (!req.hotel || !req.user) throw new HttpError(401, 'unauthenticated');
  const { id } = req.hotel;
  const userId = req.user.id;
  return withTenant(id, userId, (tx) => fn(tx, id, userId));
}
