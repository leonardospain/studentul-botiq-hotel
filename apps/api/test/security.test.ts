import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, makeClient, PASSWORD } from './helpers.js';
import { withContext, withTenant } from '../src/db.js';
import { ROLE_PERMISSIONS } from '../src/permissions.js';
import { resetLoginLimiter } from '../src/routes/auth.js';

let ctx: Awaited<ReturnType<typeof boot>>;
let Z: string, O: string;
beforeAll(async () => { ctx = await boot(); Z = ctx.seed.hotels['zanzibar-boutique']; O = ctx.seed.hotels['otro-hotel-demo']; });
afterAll(async () => { await ctx.close(); });

describe('autenticación', () => {
  it('rechaza peticiones sin sesión', async () => {
    const c = makeClient(ctx.app);
    expect((await c.get(`/api/h/${Z}/rooms`)).status).toBe(401);
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  it('login correcto emite cookie HttpOnly SameSite=Lax y logout la invalida', async () => {
    const c = makeClient(ctx.app);
    const r = await c.login('reception@zanzibar.test');
    expect(r.status).toBe(200);
    const cookie = String(r.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(r.body.memberships[0].role).toBe('receptionist');
    expect(JSON.stringify(r.body)).not.toMatch(/password|hash/i);
    expect((await c.get('/api/auth/me')).status).toBe(200);
    await c.post('/api/auth/logout');
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  it('credenciales erróneas dan el mismo error y se bloquean tras 5 intentos', async () => {
    const c = makeClient(ctx.app);
    const a = await c.login('owner@zanzibar.test', 'incorrecta-123');
    const b = await c.login('no-existe@zanzibar.test', 'incorrecta-123');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
    for (let i = 0; i < 3; i++) await c.login('owner@zanzibar.test', 'incorrecta-123');
    expect((await c.login('owner@zanzibar.test', 'incorrecta-123')).status).toBe(401); // 5.º intento
    expect((await c.login('owner@zanzibar.test', PASSWORD)).status).toBe(429); // bloqueado aunque sea correcta
    resetLoginLimiter(); // no arrastrar el bloqueo a otras pruebas
  });

  it('bloquea mutaciones con Origin no permitido (CSRF)', async () => {
    const c = makeClient(ctx.app);
    const r = await c.post('/api/auth/login', { email: 'x@y.test', password: 'x' }, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
    // mismo origen (Origin.host == Host) sí se acepta
    const same = await c.post('/api/auth/login', { email: 'x@y.test', password: 'x' }, { origin: 'http://localhost:3111', host: 'localhost:3111' });
    expect(same.status).toBe(401); // llega al login (credenciales inválidas), no es 403
    // mismo hostname pero distinto puerto/host: rechazado
    expect((await c.post('/api/auth/login', { email: 'x@y.test', password: 'x' }, { origin: 'http://evil.localhost', host: 'localhost' })).status).toBe(403);
  });
});

describe('aislamiento entre hoteles (API)', () => {
  it('un usuario de un hotel no accede a otro hotel', async () => {
    const c = makeClient(ctx.app);
    await c.login('owner@zanzibar.test');
    expect((await c.get(`/api/h/${Z}/rooms`)).body).toHaveLength(15);
    const other = await c.get(`/api/h/${O}/rooms`);
    expect(other.status).toBe(403);
    expect((await c.get(`/api/h/00000000-0000-0000-0000-000000000000/rooms`)).status).toBe(403); // igual que inexistente
    expect((await c.get(`/api/h/no-es-uuid/rooms`)).status).toBe(403);
  });

  it('una reserva de un hotel es invisible (404) desde otro hotel', async () => {
    const a = makeClient(ctx.app); await a.login('reception@zanzibar.test');
    const types = (await a.get(`/api/h/${Z}/room-types`)).body;
    const d = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    const d2 = new Date(Date.now() + 42 * 86400000).toISOString().slice(0, 10);
    const res = await a.post(`/api/h/${Z}/reservations`, { guest: { full_name: 'Huésped Privado' }, room_type_id: types[0].id, check_in: d, check_out: d2 });
    expect(res.status).toBe(201);
    const b = makeClient(ctx.app); await b.login('owner@otro.test');
    expect((await b.get(`/api/h/${O}/reservations/${res.body.id}`)).status).toBe(404);
    expect((await b.get(`/api/h/${O}/reservations`)).body).toHaveLength(0);
  });

  it('el administrador de plataforma ve todos los hoteles; los demás no', async () => {
    const owner = makeClient(ctx.app); await owner.login('owner@zanzibar.test');
    expect((await owner.get('/api/platform/hotels')).status).toBe(403);
    const admin = makeClient(ctx.app); await admin.login('platform@botiq.test');
    const list = await admin.get('/api/platform/hotels');
    expect(list.status).toBe(200);
    expect(list.body.map((h: any) => h.slug).sort()).toEqual(['otro-hotel-demo', 'zanzibar-boutique']);
  });
});

describe('aislamiento entre hoteles (base de datos, RLS)', () => {
  it('sin contexto no se ve ninguna fila; con contexto solo las del hotel', async () => {
    const none = await withContext({}, async (tx) => (await tx.query('SELECT count(*)::int n FROM rooms')).rows[0].n);
    expect(none).toBe(0);
    expect(await withTenant(Z, undefined, async (tx) => (await tx.query('SELECT count(*)::int n FROM rooms')).rows[0].n)).toBe(15);
    expect(await withTenant(O, undefined, async (tx) => (await tx.query('SELECT count(*)::int n FROM rooms')).rows[0].n)).toBe(2);
  });

  it('no se puede insertar datos en otro hotel ni referenciar filas de otro hotel', async () => {
    await expect(withTenant(Z, undefined, (tx) =>
      tx.query(`INSERT INTO guests(hotel_id, full_name) VALUES ($1, 'Intruso')`, [O]))).rejects.toMatchObject({ code: '42501' });
    const roomO = await withTenant(O, undefined, async (tx) => (await tx.query('SELECT id, room_type_id FROM rooms LIMIT 1')).rows[0]);
    const guestZ = await withTenant(Z, undefined, async (tx) => (await tx.query(`INSERT INTO guests(hotel_id, full_name) VALUES ($1,'G') RETURNING id`, [Z])).rows[0].id);
    await expect(withTenant(Z, undefined, (tx) =>
      tx.query(`INSERT INTO reservations(hotel_id, code, guest_id, room_id, room_type_id, check_in, check_out, total_cents)
                VALUES ($1,'XX-1',$2,$3,$4,'2030-01-01','2030-01-02',1)`, [Z, guestZ, roomO.id, roomO.room_type_id]))).rejects.toMatchObject({ code: '23503' });
  });

  it('el usuario de la aplicación no puede saltarse RLS ni alterar la auditoría', async () => {
    await expect(withContext({}, (tx) => tx.query(`UPDATE audit_log SET action = 'x'`))).rejects.toMatchObject({ code: '42501' });
    await expect(withContext({}, (tx) => tx.query(`DELETE FROM audit_log`))).rejects.toMatchObject({ code: '42501' });
    await expect(withTenant(Z, undefined, (tx) => tx.query(`DELETE FROM payments`))).rejects.toMatchObject({ code: '42501' });
    const r = await withContext({}, async (tx) => (await tx.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`)).rows[0]);
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('los pagos reales están bloqueados por la base de datos mientras sean simulados', async () => {
    const { rid } = await withTenant(Z, undefined, async (tx) => {
      const g = (await tx.query(`INSERT INTO guests(hotel_id, full_name) VALUES ($1,'P') RETURNING id`, [Z])).rows[0].id;
      const room = (await tx.query('SELECT id, room_type_id FROM rooms LIMIT 1')).rows[0];
      const r = (await tx.query(`INSERT INTO reservations(hotel_id, code, guest_id, room_id, room_type_id, check_in, check_out, total_cents)
        VALUES ($1,'PAY-1',$2,$3,$4,'2031-01-01','2031-01-02',100) RETURNING id`, [Z, g, room.id, room.room_type_id])).rows[0];
      return { rid: r.id };
    });
    await expect(withTenant(Z, undefined, (tx) =>
      tx.query(`INSERT INTO payments(hotel_id, reservation_id, amount_cents, method, simulated) VALUES ($1,$2,100,'cash',false)`, [Z, rid]))).rejects.toMatchObject({ code: '23514' });
  });
});

describe('roles y permisos', () => {
  const cases: [string, string, 'get' | 'post', (z: string) => string, number][] = [
    ['housekeeping@zanzibar.test', 'housekeeping no crea reservas', 'post', (z) => `/api/h/${z}/reservations`, 403],
    ['reception@zanzibar.test', 'recepción no lee la auditoría', 'get', (z) => `/api/h/${z}/audit`, 403],
    ['reception@zanzibar.test', 'recepción no gestiona personal', 'get', (z) => `/api/h/${z}/staff`, 403],
    ['accounting@zanzibar.test', 'contabilidad no crea reservas', 'post', (z) => `/api/h/${z}/reservations`, 403],
    ['accounting@zanzibar.test', 'contabilidad sí lee informes', 'get', (z) => `/api/h/${z}/reports/revenue?from=2026-01-01&to=2026-12-31`, 200],
    ['manager@zanzibar.test', 'manager lee auditoría', 'get', (z) => `/api/h/${z}/audit`, 200],
    ['manager@zanzibar.test', 'manager no gestiona personal', 'get', (z) => `/api/h/${z}/staff`, 403],
    ['owner@zanzibar.test', 'propietario gestiona personal', 'get', (z) => `/api/h/${z}/staff`, 200],
  ];
  for (const [user, name, method, url, expected] of cases) {
    it(name, async () => {
      const c = makeClient(ctx.app); await c.login(user);
      const r = method === 'get' ? await c.get(url(Z)) : await c.post(url(Z), {});
      expect(r.status).toBe(expected);
    });
  }

  it('la matriz de permisos no da gestión de personal a nadie salvo al propietario', () => {
    const withStaff = Object.entries(ROLE_PERMISSIONS).filter(([, p]) => p.includes('staff:manage')).map(([r]) => r);
    expect(withStaff).toEqual(['owner']);
  });

  it('no se puede dejar un hotel sin propietario', async () => {
    const c = makeClient(ctx.app); await c.login('owner@zanzibar.test');
    const staff = (await c.get(`/api/h/${Z}/staff`)).body;
    const owner = staff.find((s: any) => s.role === 'owner');
    expect((await c.patch(`/api/h/${Z}/staff/${owner.id}`, { role: 'manager' })).status).toBe(409);
    expect((await c.patch(`/api/h/${Z}/staff/${owner.id}`, { active: false })).status).toBe(409);
  });

  it('un miembro desactivado pierde el acceso', async () => {
    const owner = makeClient(ctx.app); await owner.login('owner@zanzibar.test');
    const staff = (await owner.get(`/api/h/${Z}/staff`)).body;
    const acc = staff.find((s: any) => s.email === 'accounting@zanzibar.test');
    const u = makeClient(ctx.app); await u.login('accounting@zanzibar.test');
    expect((await u.get(`/api/h/${Z}/reports/revenue?from=2026-01-01&to=2026-12-31`)).status).toBe(200);
    expect((await owner.patch(`/api/h/${Z}/staff/${acc.id}`, { active: false })).status).toBe(200);
    expect((await u.get(`/api/h/${Z}/reports/revenue?from=2026-01-01&to=2026-12-31`)).status).toBe(403);
    await owner.patch(`/api/h/${Z}/staff/${acc.id}`, { active: true });
  });
});

describe('planes SaaS', () => {
  it('el plan limita habitaciones y personal', async () => {
    const c = makeClient(ctx.app); await c.login('owner@zanzibar.test');
    const types = (await c.get(`/api/h/${Z}/room-types`)).body;
    for (let i = 0; i < 5; i++) expect((await c.post(`/api/h/${Z}/rooms`, { number: `90${i}`, room_type_id: types[0].id })).status).toBe(201); // 15 -> 20
    const over = await c.post(`/api/h/${Z}/rooms`, { number: '999', room_type_id: types[0].id });
    expect(over.status).toBe(402);
    expect(over.body.error).toBe('plan_limit_rooms');
  });

  it('la plataforma crea un hotel nuevo con su propietario y queda aislado', async () => {
    const admin = makeClient(ctx.app); await admin.login('platform@botiq.test');
    const created = await admin.post('/api/platform/hotels', { name: 'Hotel Nuevo', slug: 'hotel-nuevo', plan_code: 'starter',
      owner: { email: 'owner@nuevo.test', full_name: 'Owner Nuevo', password: 'una-clave-larga-123' } });
    expect(created.status).toBe(201);
    const o = makeClient(ctx.app);
    expect((await o.login('owner@nuevo.test', 'una-clave-larga-123')).status).toBe(200);
    expect((await o.get(`/api/h/${created.body.id}/rooms`)).body).toEqual([]);
    expect((await o.get(`/api/h/${Z}/rooms`)).status).toBe(403);
  });
});
