import type { Tx } from './db.js';

export async function audit(
  tx: Tx,
  e: { hotelId?: string | null; userId?: string | null; action: string; entity?: string; entityId?: string; data?: unknown; ip?: string },
) {
  await tx.query(
    'INSERT INTO audit_log(hotel_id, user_id, action, entity, entity_id, data, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [e.hotelId ?? null, e.userId ?? null, e.action, e.entity ?? null, e.entityId ?? null, JSON.stringify(e.data ?? {}), e.ip ?? null],
  );
}
