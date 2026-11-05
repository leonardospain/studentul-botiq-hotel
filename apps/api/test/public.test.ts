import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, boot, makeClient, type Client } from './helpers.js';
import { resetPublicLimiter } from '../src/routes/public.js';

let ctx: Awaited<ReturnType<typeof boot>>;
let Z: string;
let anon: Client, owner: Client, platform: Client;
let types: Record<string, any>;
let today: string;
const S = '/api/public/zanzibar-boutique';

beforeAll(async () => {
  ctx = await boot();
  Z = ctx.seed.hotels['zanzibar-boutique'];
  anon = makeClient(ctx.app);
  owner = makeClient(ctx.app); await owner.login('owner@zanzibar.test');
  platform = makeClient(ctx.app); await platform.login('platform@botiq.test');
  types = Object.fromEntries((await owner.get(`/api/h/${Z}/room-types`)).body.map((t: any) => [t.name, t]));
  today = (await owner.get(`/api/h/${Z}/frontdesk`)).body.today;
});
beforeEach(() => resetPublicLimiter());
afterAll(async () => { await ctx.close(); });

const guest = { full_name: 'Maria Ionescu', email: 'maria@example.test', country: 'RO' };
const body = (type: string, ci: string, co: string, extra: object = {}) =>
  ({ room_type_id: types[type].id, check_in: ci, check_out: co, adults: 2, guest, language: 'ro', accept_terms: true, ...extra });

describe('web pública', () => {
  it('muestra el hotel con textos en 5 idiomas sin exponer habitaciones ni datos internos', async () => {
    const r = await anon.get(S);
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Zanzibar Boutique Hotel');
    expect(r.body.languages).toEqual(['ro', 'en', 'es', 'it', 'fr']);
    expect(r.body.room_types).toHaveLength(3);
    for (const l of ['ro', 'en', 'es', 'it', 'fr']) expect(r.body.room_types[0].description_i18n[l]).toBeTruthy();
    expect(JSON.stringify(r.body)).not.toMatch(/hotel_id|"number"|owner@|password/);
  });

  it('404 para hoteles inexistentes o suspendidos', async () => {
    expect((await anon.get('/api/public/no-existe')).status).toBe(404);
    expect((await platform.patch(`/api/platform/hotels/${ctx.seed.hotels['otro-hotel-demo']}`, { status: 'suspended' })).status).toBe(200);
    expect((await anon.get('/api/public/otro-hotel-demo')).status).toBe(404);
  });

  it('la disponibilidad pública no revela números de habitación', async () => {
    const r = await anon.get(`${S}/availability?check_in=${addDays(today, 500)}&check_out=${addDays(today, 503)}&adults=2`);
    expect(r.status).toBe(200);
    expect(r.body.room_types.map((t: any) => t.name)).toEqual(['Garden Room', 'Ocean View', 'Beach Suite']);
    expect(r.body.room_types[0].total_cents).toBe(3 * 14000);
    expect(JSON.stringify(r.body)).not.toMatch(/"rooms"|"number"/);
  });

  it('crea una reserva web con pago simulado del 30 % visible en el panel', async () => {
    const ci = addDays(today, 500), co = addDays(today, 502);
    const r = await anon.post(`${S}/bookings`, body('Ocean View', ci, co));
    expect(r.status).toBe(201);
    expect(r.body.code).toMatch(/^BH-[A-Z0-9]{6}$/);
    expect(r.body.total_cents).toBe(2 * 19000);
    expect(r.body.deposit_cents).toBe(Math.ceil(38000 * 0.3));
    expect(r.body.balance_cents).toBe(38000 - r.body.deposit_cents);
    expect(r.body.simulated_payment).toBe(true);

    const list = (await owner.get(`/api/h/${Z}/reservations?q=${r.body.code}`)).body;
    expect(list).toHaveLength(1);
    expect(list[0].source).toBe('web');
    expect(list[0].paid_cents).toBe(r.body.deposit_cents);
    expect(list[0].status).toBe('confirmed');
    const pays = (await owner.get(`/api/h/${Z}/payments`)).body;
    expect(pays.find((p: any) => p.code === r.body.code).simulated).toBe(true);
  });

  it('valida entrada: condiciones, honeypot, email, fechas pasadas, capacidad y tipo ajeno', async () => {
    const ci = addDays(today, 70), co = addDays(today, 71);
    expect((await anon.post(`${S}/bookings`, body('Garden Room', ci, co, { accept_terms: false }))).status).toBe(400);
    expect((await anon.post(`${S}/bookings`, body('Garden Room', ci, co, { website: 'http://spam' }))).status).toBe(400);
    expect((await anon.post(`${S}/bookings`, body('Garden Room', ci, co, { guest: { full_name: 'X Y', email: 'no-es-email' } }))).status).toBe(400);
    expect((await anon.post(`${S}/bookings`, body('Garden Room', addDays(today, -2), co))).status).toBe(422);
    expect((await anon.post(`${S}/bookings`, body('Garden Room', ci, co, { adults: 4 }))).status).toBe(422);
    // un tipo de habitación de otro hotel no es válido aquí
    const otherType = (await makeClient(ctx.app).get('/api/public/zanzibar-boutique')).body.room_types[0].id;
    const o = await platform.patch(`/api/platform/hotels/${ctx.seed.hotels['otro-hotel-demo']}`, { status: 'active' });
    expect(o.status).toBe(200);
    expect((await anon.post('/api/public/otro-hotel-demo/bookings', { ...body('Garden Room', ci, co), room_type_id: otherType })).status).toBe(422);
  });

  it('reservas web concurrentes no superan el inventario', async () => {
    const ci = addDays(today, 90), co = addDays(today, 92);
    // 6 peticiones; el límite es 10/h por IP
    const rs = await Promise.all(Array.from({ length: 6 }, () => anon.post(`${S}/bookings`, body('Beach Suite', ci, co, { adults: 2 }))));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(3);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it('consulta de reserva solo con código + email correctos', async () => {
    const r = await anon.post(`${S}/bookings`, body('Garden Room', addDays(today, 120), addDays(today, 121)));
    const code = r.body.code;
    expect((await anon.get(`${S}/bookings/${code}?email=otro@example.test`)).status).toBe(404);
    const ok = await anon.get(`${S}/bookings/${code}?email=MARIA@example.test`);
    expect(ok.status).toBe(200);
    expect(ok.body.balance_cents).toBe(r.body.balance_cents);
    expect(JSON.stringify(ok.body)).not.toMatch(/guest|email|phone|room_number/);
    expect((await anon.get(`${S}/bookings/BH-XXXXXX?email=maria@example.test`)).status).toBe(404);
  });

  it('limita las reservas por IP (10/hora)', async () => {
    resetPublicLimiter();
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await anon.post(`${S}/bookings`, body('Garden Room', addDays(today, 150 + i * 2), addDays(today, 151 + i * 2)))).status;
    expect(last).toBe(429);
  });
});
