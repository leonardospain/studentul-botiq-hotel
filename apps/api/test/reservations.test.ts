import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, boot, makeClient, type Client } from './helpers.js';

let ctx: Awaited<ReturnType<typeof boot>>;
let Z: string;
let rec: Client, mgr: Client, hk: Client, acc: Client;
let types: Record<string, any>;
let today: string;

beforeAll(async () => {
  ctx = await boot();
  Z = ctx.seed.hotels['zanzibar-boutique'];
  rec = makeClient(ctx.app); await rec.login('reception@zanzibar.test');
  mgr = makeClient(ctx.app); await mgr.login('manager@zanzibar.test');
  hk = makeClient(ctx.app); await hk.login('housekeeping@zanzibar.test');
  acc = makeClient(ctx.app); await acc.login('accounting@zanzibar.test');
  types = Object.fromEntries((await rec.get(`/api/h/${Z}/room-types`)).body.map((t: any) => [t.name, t]));
  today = (await rec.get(`/api/h/${Z}/frontdesk`)).body.today;
});
afterAll(async () => { await ctx.close(); });

const book = (c: Client, type: string, ci: string, co: string, extra: object = {}) =>
  c.post(`/api/h/${Z}/reservations`, { guest: { full_name: 'Test Guest', email: 'g@test.example' }, room_type_id: types[type].id, check_in: ci, check_out: co, ...extra });

describe('tarifas y disponibilidad', () => {
  it('calcula el total por noche aplicando tarifas de temporada', async () => {
    const start = addDays(today, 500);
    // 2 noches en temporada alta (200,00 USD) y 2 a tarifa base (190,00 USD, Ocean View)
    const rate = await mgr.post(`/api/h/${Z}/rates`, { room_type_id: types['Ocean View'].id, name: 'Test alta', start_date: start, end_date: addDays(start, 2), price_cents: 20000 });
    expect(rate.status).toBe(201);
    const r = await book(rec, 'Ocean View', start, addDays(start, 4));
    expect(r.status).toBe(201);
    expect(r.body.total_cents).toBe(2 * 20000 + 2 * 19000);
    expect(r.body.status).toBe('confirmed');
    expect(r.body.code).toMatch(/^BH-[A-Z0-9]{6}$/);
  });

  it('rechaza temporadas solapadas del mismo tipo', async () => {
    const start = addDays(today, 500);
    const r = await mgr.post(`/api/h/${Z}/rates`, { room_type_id: types['Ocean View'].id, name: 'Solape', start_date: addDays(start, 1), end_date: addDays(start, 3), price_cents: 1 });
    expect(r.status).toBe(409);
  });

  it('la disponibilidad descuenta habitaciones reservadas y filtra por capacidad', async () => {
    const ci = addDays(today, 100), co = addDays(today, 103);
    const before = (await rec.get(`/api/h/${Z}/availability?check_in=${ci}&check_out=${co}&adults=2`)).body;
    expect(before.room_types.find((t: any) => t.name === 'Garden Room').available).toBe(6);
    await book(rec, 'Garden Room', ci, co);
    const after = (await rec.get(`/api/h/${Z}/availability?check_in=${ci}&check_out=${co}&adults=2`)).body;
    const g = after.room_types.find((t: any) => t.name === 'Garden Room');
    expect(g.available).toBe(5);
    expect(g.total_cents).toBe(3 * 14000);
    // 3 adultos: solo Beach Suite
    const big = (await rec.get(`/api/h/${Z}/availability?check_in=${ci}&check_out=${co}&adults=3`)).body;
    expect(big.room_types.map((t: any) => t.name)).toEqual(['Beach Suite']);
  });

  it('valida fechas y capacidad', async () => {
    expect((await book(rec, 'Garden Room', addDays(today, 10), addDays(today, 10))).status).toBe(422);
    expect((await book(rec, 'Garden Room', '2026-02-30', '2026-03-02')).status).toBe(400);
    expect((await book(rec, 'Garden Room', addDays(today, -1), addDays(today, 2))).status).toBe(422);
    expect((await book(rec, 'Garden Room', addDays(today, 10), addDays(today, 12), { adults: 5 })).status).toBe(422);
    expect((await book(rec, 'Garden Room', addDays(today, 10), addDays(today, 200))).status).toBe(422);
  });
});

describe('sin dobles reservas', () => {
  it('agotadas las habitaciones del tipo, la siguiente reserva da 409', async () => {
    const ci = addDays(today, 200), co = addDays(today, 202);
    for (let i = 0; i < 3; i++) expect((await book(rec, 'Beach Suite', ci, co)).status).toBe(201);
    const r = await book(rec, 'Beach Suite', ci, co);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('no_availability');
    // fechas contiguas (salida = entrada) NO solapan
    expect((await book(rec, 'Beach Suite', co, addDays(co, 1))).status).toBe(201);
  });

  it('peticiones concurrentes nunca superan el inventario', async () => {
    const ci = addDays(today, 300), co = addDays(today, 302);
    const results = await Promise.all(Array.from({ length: 12 }, () => book(rec, 'Beach Suite', ci, co)));
    const ok = results.filter((r) => r.status === 201);
    expect(ok).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    const rooms = new Set(ok.map((r) => r.body.room_id));
    expect(rooms.size).toBe(3);
  });

  it('cambiar fechas a un hueco ocupado da 409 y a uno libre recalcula el total', async () => {
    const a = (await book(rec, 'Beach Suite', addDays(today, 400), addDays(today, 402))).body;
    // otra reserva en LA MISMA suite justo después: 404-406
    expect((await book(rec, 'Beach Suite', addDays(today, 404), addDays(today, 406), { room_id: a.room_id })).status).toBe(201);
    // alargar hasta 404 (sale el día que entra la otra) es posible; hasta 405 solapa => 409
    const ok = await rec.patch(`/api/h/${Z}/reservations/${a.id}`, { check_out: addDays(today, 404) });
    expect(ok.status).toBe(200);
    expect(ok.body.total_cents).toBe(4 * 32000);
    const conflict = await rec.patch(`/api/h/${Z}/reservations/${a.id}`, { check_out: addDays(today, 405) });
    expect(conflict.status).toBe(409);
    // tras el 409 la reserva no cambió
    expect((await rec.get(`/api/h/${Z}/reservations/${a.id}`)).body.check_out).toBe(addDays(today, 404));
    const shorter = await rec.patch(`/api/h/${Z}/reservations/${a.id}`, { check_out: addDays(today, 401) });
    expect(shorter.status).toBe(200);
    expect(shorter.body.total_cents).toBe(32000);
    // mover la entrada al pasado está prohibido
    expect((await rec.patch(`/api/h/${Z}/reservations/${a.id}`, { check_in: addDays(today, -3) })).status).toBe(422);
  });

  it('cancelar libera la habitación', async () => {
    const ci = addDays(today, 500 + 30), co = addDays(today, 500 + 31);
    const rs = [];
    for (let i = 0; i < 3; i++) rs.push((await book(rec, 'Beach Suite', ci, co)).body);
    expect((await book(rec, 'Beach Suite', ci, co)).status).toBe(409);
    expect((await rec.post(`/api/h/${Z}/reservations/${rs[0].id}/cancel`, { reason: 'test' })).body.status).toBe('cancelled');
    expect((await book(rec, 'Beach Suite', ci, co)).status).toBe(201);
    expect((await rec.post(`/api/h/${Z}/reservations/${rs[0].id}/cancel`)).status).toBe(409); // ya cancelada
  });

  it('asignar otra habitación solo permite habitaciones libres del mismo tipo', async () => {
    const ci = addDays(today, 600), co = addDays(today, 602);
    const a = (await book(rec, 'Garden Room', ci, co)).body;
    const b = (await book(rec, 'Garden Room', ci, co)).body;
    const rooms = (await rec.get(`/api/h/${Z}/rooms`)).body;
    const free = rooms.find((r: any) => r.room_type_name === 'Garden Room' && r.id !== a.room_id && r.id !== b.room_id);
    const ok = await rec.post(`/api/h/${Z}/reservations/${a.id}/assign-room`, { room_id: free.id });
    expect(ok.status).toBe(200);
    expect(ok.body.room_id).toBe(free.id);
    expect((await rec.post(`/api/h/${Z}/reservations/${a.id}/assign-room`, { room_id: b.room_id })).status).toBe(409);
    const ocean = rooms.find((r: any) => r.room_type_name === 'Ocean View');
    expect((await rec.post(`/api/h/${Z}/reservations/${a.id}/assign-room`, { room_id: ocean.id })).status).toBe(409);
  });
});

describe('asignación automática', () => {
  it('prefiere habitaciones limpias a las sucias', async () => {
    const rooms = (await rec.get(`/api/h/${Z}/rooms`)).body.filter((r: any) => r.room_type_name === 'Garden Room');
    const first = rooms[0];
    await hk.patch(`/api/h/${Z}/rooms/${first.id}/housekeeping`, { status: 'dirty' });
    const r = await book(rec, 'Garden Room', addDays(today, 800), addDays(today, 801));
    expect(r.status).toBe(201);
    expect(r.body.room_id).not.toBe(first.id); // la primera por número está sucia: se elige otra
    await hk.patch(`/api/h/${Z}/rooms/${first.id}/housekeeping`, { status: 'clean' });
  });
});

describe('recorrido completo: reserva → pago → entrada → extras → salida → limpieza', () => {
  it('ejecuta el flujo y respeta las reglas de negocio', async () => {
    const res = (await book(rec, 'Ocean View', today, addDays(today, 2))).body;
    const room = (await rec.get(`/api/h/${Z}/rooms`)).body.find((r: any) => r.id === res.room_id);
    expect(res.total_cents).toBeGreaterThan(0);

    // habitación sucia => no se puede hacer check-in
    await hk.patch(`/api/h/${Z}/rooms/${room.id}/housekeeping`, { status: 'dirty' });
    const notReady = await rec.post(`/api/h/${Z}/reservations/${res.id}/check-in`);
    expect(notReady.status).toBe(409);
    expect(notReady.body.error).toBe('room_not_ready');
    expect((await hk.patch(`/api/h/${Z}/rooms/${room.id}/housekeeping`, { status: 'inspected' })).status).toBe(200);

    // reserva futura: no se puede hacer check-in antes de tiempo
    const future = (await book(rec, 'Ocean View', addDays(today, 5), addDays(today, 6))).body;
    expect((await rec.post(`/api/h/${Z}/reservations/${future.id}/check-in`)).body.error).toBe('too_early');

    const ci = await rec.post(`/api/h/${Z}/reservations/${res.id}/check-in`);
    expect(ci.status).toBe(200);
    expect(ci.body.status).toBe('checked_in');
    const fd = (await rec.get(`/api/h/${Z}/frontdesk`)).body;
    expect(fd.in_house.map((r: any) => r.id)).toContain(res.id);
    expect(fd.departures.map((r: any) => r.id)).not.toContain(res.id);

    // extras: excursión + transfer
    const ex = await rec.post(`/api/h/${Z}/reservations/${res.id}/extras`, { kind: 'excursion', description: 'Safari Blue', quantity: 2, unit_price_cents: 6500 });
    expect(ex.status).toBe(201);
    await rec.post(`/api/h/${Z}/reservations/${res.id}/extras`, { kind: 'transfer', description: 'Transfer aeropuerto', unit_price_cents: 3000 });
    let cur = (await rec.get(`/api/h/${Z}/reservations/${res.id}`)).body;
    expect(cur.extras_cents).toBe(2 * 6500 + 3000);
    const due = cur.total_cents + cur.extras_cents;
    expect(cur.balance_cents).toBe(due);

    // no se puede salir con saldo pendiente
    expect((await rec.post(`/api/h/${Z}/reservations/${res.id}/check-out`)).body.error).toBe('balance_due');
    // ni siquiera con allow_balance si el rol no tiene permiso de override
    expect((await rec.post(`/api/h/${Z}/reservations/${res.id}/check-out`, { allow_balance: true })).status).toBe(409);

    // pagos simulados
    expect((await rec.post(`/api/h/${Z}/reservations/${res.id}/payments`, { amount_cents: due + 1, method: 'card_simulated' })).body.error).toBe('overpayment');
    const p1 = await rec.post(`/api/h/${Z}/reservations/${res.id}/payments`, { amount_cents: 10000, method: 'card_simulated' });
    expect(p1.status).toBe(201);
    expect(p1.body.payments[0].simulated).toBe(true);
    expect((await rec.post(`/api/h/${Z}/reservations/${res.id}/payments`, { amount_cents: due - 10000, method: 'cash' })).body.balance_cents).toBe(0);
    expect((await acc.post(`/api/h/${Z}/reservations/${res.id}/payments`, { amount_cents: 1, method: 'cash' })).status).toBe(403);

    const out = await rec.post(`/api/h/${Z}/reservations/${res.id}/check-out`);
    expect(out.status).toBe(200);
    expect(out.body.status).toBe('checked_out');
    const after = (await rec.get(`/api/h/${Z}/rooms`)).body.find((r: any) => r.id === room.id);
    expect(after.housekeeping_status).toBe('dirty');
    expect(after.in_house_code).toBeNull();

    // informes
    const rev = (await mgr.get(`/api/h/${Z}/reports/revenue?from=${today}&to=${today}`)).body;
    expect(rev.collected_cents).toBe(due);
    expect(rev.simulated_payments).toBe(true);
    const occ = (await mgr.get(`/api/h/${Z}/reports/occupancy?from=${today}&to=${addDays(today, 2)}`)).body;
    expect(occ.days[0].occupied).toBeGreaterThanOrEqual(1);
    expect(occ.days[0].rooms).toBe(15);
  });

  it('el manager puede autorizar la salida con saldo y queda auditado', async () => {
    const res = (await book(mgr, 'Garden Room', today, addDays(today, 1))).body;
    expect((await mgr.post(`/api/h/${Z}/reservations/${res.id}/check-in`)).status).toBe(200);
    const out = await mgr.post(`/api/h/${Z}/reservations/${res.id}/check-out`, { allow_balance: true });
    expect(out.status).toBe(200);
    const audit = (await mgr.get(`/api/h/${Z}/audit?limit=20`)).body;
    expect(audit.find((a: any) => a.action === 'reservation.check_out' && a.entity_id === res.id).data.overridden).toBe(true);
  });

  it('un reembolso no puede superar lo pagado', async () => {
    const res = (await book(rec, 'Garden Room', addDays(today, 700), addDays(today, 701))).body;
    await rec.post(`/api/h/${Z}/reservations/${res.id}/payments`, { amount_cents: 5000, method: 'transfer' });
    expect((await rec.post(`/api/h/${Z}/reservations/${res.id}/payments`, { amount_cents: 6000, method: 'transfer', kind: 'refund' })).status).toBe(422);
    const ok = await rec.post(`/api/h/${Z}/reservations/${res.id}/payments`, { amount_cents: 5000, method: 'transfer', kind: 'refund' });
    expect(ok.body.paid_cents).toBe(0);
  });

  it('cada operación queda en la auditoría del hotel', async () => {
    const audit = (await mgr.get(`/api/h/${Z}/audit?limit=500`)).body;
    const actions = new Set(audit.map((a: any) => a.action));
    for (const a of ['reservation.create', 'reservation.check_in', 'reservation.check_out', 'payment.payment', 'extra.add', 'housekeeping.update', 'rate.create'])
      expect(actions.has(a), a).toBe(true);
  });
});
