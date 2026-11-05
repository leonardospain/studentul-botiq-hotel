// DEMO AUTÓNOMA SIN WEBASSEMBLY: motor de datos en JavaScript puro que atiende las mismas rutas /api/... que el servidor.
// Reimplementa las reglas de negocio (disponibilidad, precios, sin doble reserva, check-in/out, pagos simulados...) sobre datos
// FICTICIOS en memoria. NO es el backend real: ese está en apps/api y se prueba contra PostgreSQL.
import { ROLE_PERMISSIONS, type Role } from '../../../api/src/permissions';

type Req = { method: string; url: string; headers: Record<string, string>; body?: string };
type Res = { status: number; headers: Record<string, string>; body: string; cookies: { name: string; value: string; clear: boolean }[] };
class Http extends Error { constructor(public status: number, public code: string, message?: string) { super(message ?? code); } }

const DAY = 86_400_000;
const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10); // Africa/Dar_es_Salaam (UTC+3)
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const overlaps = (a1: string, a2: string, b1: string, b2: string) => a1 < b2 && b1 < a2;
const ACTIVE = ['pending', 'confirmed', 'checked_in'];
const LANGS = ['ro', 'en', 'es', 'it', 'fr'];

const I18N: Record<string, Record<string, string>> = {
  'Garden Room': { ro: 'Cameră cu grădină tropicală, terasă privată și baie cu duș exterior.', en: 'Room opening onto a tropical garden, with a private terrace and outdoor shower.', es: 'Habitación con jardín tropical, terraza privada y ducha exterior.', it: 'Camera con giardino tropicale, terrazza privata e doccia esterna.', fr: 'Chambre sur jardin tropical, terrasse privée et douche extérieure.' },
  'Ocean View': { ro: 'Cameră cu vedere spre Oceanul Indian și balcon amenajat.', en: 'Room with Indian Ocean views and a furnished balcony.', es: 'Habitación con vistas al océano Índico y balcón amueblado.', it: "Camera con vista sull'Oceano Indiano e balcone arredato.", fr: "Chambre avec vue sur l'océan Indien et balcon aménagé." },
  'Beach Suite': { ro: 'Suită direct pe plajă, cu living separat și piscină privată.', en: 'Beachfront suite with a separate living area and private plunge pool.', es: 'Suite frente a la playa, con salón independiente y piscina privada.', it: 'Suite fronte spiaggia con salotto separato e piscina privata.', fr: 'Suite en bord de plage avec salon séparé et piscine privée.' },
};

export function createMockApi(demoPassword: string) {
  let seq = 1;
  const uid = (p: string) => `${p}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const nowIso = () => new Date().toISOString();

  // ---------- datos ----------
  const plans = [
    { id: 'plan-starter', code: 'starter', name: 'Starter (demo)', price_usd_cents_month: 4900, max_rooms: 20, max_staff: 10, features: {} },
    { id: 'plan-growth', code: 'growth', name: 'Growth (demo)', price_usd_cents_month: 14900, max_rooms: 60, max_staff: 40, features: {} },
    { id: 'plan-scale', code: 'scale', name: 'Scale (demo)', price_usd_cents_month: 39900, max_rooms: 200, max_staff: 150, features: {} },
  ];
  const hotels: any[] = [
    { id: 'hotel-zanzibar', slug: 'zanzibar-boutique', name: 'Zanzibar Boutique Hotel', city: 'Paje', country: 'TZ', timezone: 'Africa/Dar_es_Salaam', currencies: ['USD', 'TZS'], web_languages: LANGS, admin_language: 'ro', plan: 'starter', status: 'active' },
    { id: 'hotel-otro', slug: 'otro-hotel-demo', name: 'Otro Hotel (demo)', city: 'Nungwi', country: 'TZ', timezone: 'Africa/Dar_es_Salaam', currencies: ['USD'], web_languages: LANGS, admin_language: 'ro', plan: 'starter', status: 'active' },
  ];
  const users: any[] = [
    { id: 'u-platform', email: 'platform@botiq.test', full_name: 'Administrador de plataforma', platform: true, password: demoPassword },
    { id: 'u-owner', email: 'owner@zanzibar.test', full_name: 'Propietar Zanzibar', password: demoPassword },
    { id: 'u-manager', email: 'manager@zanzibar.test', full_name: 'Manager Zanzibar', password: demoPassword },
    { id: 'u-reception', email: 'reception@zanzibar.test', full_name: 'Recepție Zanzibar', password: demoPassword },
    { id: 'u-housekeeping', email: 'housekeeping@zanzibar.test', full_name: 'Curățenie Zanzibar', password: demoPassword },
    { id: 'u-accounting', email: 'accounting@zanzibar.test', full_name: 'Contabil Zanzibar', password: demoPassword },
    { id: 'u-owner2', email: 'owner@otro.test', full_name: 'Owner Otro Hotel', password: demoPassword },
  ];
  const members: any[] = [
    ['u-owner', 'hotel-zanzibar', 'owner'], ['u-manager', 'hotel-zanzibar', 'manager'], ['u-reception', 'hotel-zanzibar', 'receptionist'],
    ['u-housekeeping', 'hotel-zanzibar', 'housekeeping'], ['u-accounting', 'hotel-zanzibar', 'accountant'], ['u-owner2', 'hotel-otro', 'owner'],
  ].map(([userId, hotelId, role]) => ({ id: uid('m'), userId, hotelId, role, active: true }));

  const roomTypes: any[] = [];
  const rooms: any[] = [];
  const rates: any[] = [];
  const addType = (hotelId: string, name: string, desc: string, ad: number, ch: number, rate: number, nums: number[]) => {
    const t = { id: uid('rt'), hotelId, name, description: desc, description_i18n: I18N[name] ?? {}, max_adults: ad, max_children: ch, base_rate_cents: rate };
    roomTypes.push(t);
    for (const n of nums) rooms.push({ id: uid('r'), hotelId, room_type_id: t.id, number: String(n), floor: Math.floor(n / 100) - 1, status: 'available', housekeeping_status: 'clean' });
    if (hotelId === 'hotel-zanzibar') for (const [label, s, e, m] of [['Alta temporada verano', '2026-07-01', '2026-09-01', 1.3], ['Alta temporada invierno', '2026-12-15', '2027-01-10', 1.4]] as const)
      rates.push({ id: uid('rp'), hotelId, room_type_id: t.id, name: label, start_date: s, end_date: e, price_cents: Math.round(rate * m) });
  };
  addType('hotel-zanzibar', 'Garden Room', 'Habitación con jardín tropical', 2, 1, 14000, [101, 102, 103, 104, 105, 106]);
  addType('hotel-zanzibar', 'Ocean View', 'Habitación con vista al mar', 2, 2, 19000, [201, 202, 203, 204, 205, 206]);
  addType('hotel-zanzibar', 'Beach Suite', 'Suite frente a la playa', 3, 2, 32000, [301, 302, 303]);
  addType('hotel-otro', 'Standard', 'Habitación estándar', 2, 0, 9000, [1, 2]);

  const guests: any[] = [];
  const reservations: any[] = [];
  const payments: any[] = [];
  const extras: any[] = [];
  const audit: any[] = [];
  let session: string | null = null; // usuario de la sesión de esta pestaña

  const log = (hotelId: string | null, action: string, entity?: string, entityId?: string, data: unknown = {}) =>
    audit.push({ id: audit.length + 1, hotelId, user_id: session, action, entity: entity ?? null, entity_id: entityId ?? null, data, created_at: nowIso() });

  // ---------- helpers ----------
  const hotelOf = (id: string) => hotels.find((h) => h.id === id);
  const typeOf = (id: string) => roomTypes.find((t) => t.id === id);
  const roomOf = (id: string) => rooms.find((r) => r.id === id);
  const guestOf = (id: string) => guests.find((g) => g.id === id);
  const planOf = (code: string) => plans.find((p) => p.code === code)!;

  const priceStay = (typeId: string, ci: string, co: string) => {
    const t = typeOf(typeId); let total = 0;
    for (let d = ci; d < co; d = addDays(d, 1)) {
      const rp = rates.find((x) => x.room_type_id === typeId && d >= x.start_date && d < x.end_date);
      total += rp ? rp.price_cents : t.base_rate_cents;
    }
    return total;
  };
  const freeRooms = (hotelId: string, ci: string, co: string, typeId?: string, exclude?: string) =>
    rooms.filter((r) => r.hotelId === hotelId && r.status === 'available' && (!typeId || r.room_type_id === typeId)
      && !reservations.some((x) => x.room_id === r.id && ACTIVE.includes(x.status) && x.id !== exclude && overlaps(x.check_in, x.check_out, ci, co)))
      .sort((a, b) => (Number(['clean', 'inspected'].includes(b.housekeeping_status)) - Number(['clean', 'inspected'].includes(a.housekeeping_status))) || a.number.localeCompare(b.number));
  const paidOf = (id: string) => payments.filter((p) => p.reservation_id === id).reduce((s, p) => s + (p.kind === 'payment' ? p.amount_cents : -p.amount_cents), 0);
  const extrasOf = (id: string) => extras.filter((e) => e.reservation_id === id).reduce((s, e) => s + e.quantity * e.unit_price_cents, 0);
  const view = (r: any) => {
    const g = guestOf(r.guest_id), rm = roomOf(r.room_id), t = typeOf(r.room_type_id);
    return { id: r.id, code: r.code, status: r.status, source: r.source, check_in: r.check_in, check_out: r.check_out, adults: r.adults, children: r.children, notes: r.notes ?? null,
      total_cents: r.total_cents, currency: 'USD', checked_in_at: r.checked_in_at ?? null, checked_out_at: r.checked_out_at ?? null, created_at: r.created_at,
      guest_id: g.id, guest_name: g.full_name, guest_email: g.email ?? null, guest_phone: g.phone ?? null,
      room_id: rm.id, room_number: rm.number, room_type_id: t.id, room_type_name: t.name, paid_cents: paidOf(r.id), extras_cents: extrasOf(r.id) };
  };
  const detail = (r: any) => {
    const v = view(r);
    return { ...v, balance_cents: v.total_cents + v.extras_cents - v.paid_cents,
      payments: payments.filter((p) => p.reservation_id === r.id).map(({ id, kind, amount_cents, method, simulated, reference, created_at }) => ({ id, kind, amount_cents, method, simulated, reference, created_at })),
      extras: extras.filter((e) => e.reservation_id === r.id).map(({ id, kind, description, quantity, unit_price_cents, service_date }) => ({ id, kind, description, quantity, unit_price_cents, service_date })) };
  };
  const newCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c; do { c = 'BH-' + Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join(''); } while (reservations.some((r) => r.code === c)); return c; };

  function createReservation(hotelId: string, b: any, source: string, language?: string) {
    if (!isDate(b.check_in) || !isDate(b.check_out)) throw new Http(400, 'validation');
    const n = nightsBetween(b.check_in, b.check_out);
    if (n < 1 || n > 60) throw new Http(422, 'invalid_range');
    if (b.check_in < today()) throw new Http(422, 'past_date');
    const t = typeOf(b.room_type_id);
    if (!t || t.hotelId !== hotelId) throw new Http(422, 'invalid_room_type');
    const adults = Number(b.adults ?? 1), children = Number(b.children ?? 0);
    if (!(adults >= 1) || children < 0) throw new Http(400, 'validation');
    if (adults > t.max_adults || children > t.max_children) throw new Http(422, 'capacity_exceeded');
    const free = freeRooms(hotelId, b.check_in, b.check_out, t.id);
    const room = b.room_id ? free.find((r) => r.id === b.room_id) : free[0];
    if (!room) throw new Http(409, 'no_availability', 'No hay habitaciones disponibles para esas fechas');
    let gid = b.guest_id;
    if (!gid) {
      const g = b.guest ?? {};
      if (!g.full_name || String(g.full_name).trim().length < 2) throw new Http(400, 'validation');
      gid = uid('g'); guests.push({ id: gid, hotelId, full_name: String(g.full_name).trim(), email: g.email, phone: g.phone, country: g.country });
    }
    const r = { id: uid('res'), hotelId, code: newCode(), guest_id: gid, room_id: room.id, room_type_id: t.id, check_in: b.check_in, check_out: b.check_out, adults, children,
      status: 'confirmed', source, total_cents: priceStay(t.id, b.check_in, b.check_out), notes: b.notes, guest_language: language, created_at: nowIso() };
    reservations.push(r); log(hotelId, 'reservation.create', 'reservation', r.id, { room: room.number, source });
    return r;
  }

  // ---------- rutas ----------
  type Ctx = { params: Record<string, string>; q: URLSearchParams; body: any };
  type Handler = (c: Ctx) => unknown | { status: number; data: unknown };
  const table: { method: string; re: RegExp; keys: string[]; fn: Handler }[] = [];
  const route = (method: string, path: string, fn: Handler) => {
    const keys: string[] = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_m, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    table.push({ method, re, keys, fn });
  };
  const created = (data: unknown) => ({ __status: 201, data });

  const me = () => session ? users.find((u) => u.id === session) : null;
  const userView = (u: any) => ({ id: u.id, email: u.email, fullName: u.full_name, locale: 'ro', isPlatformAdmin: !!u.platform });
  const membershipsOf = (u: any) => members.filter((m) => m.userId === u.id && m.active).map((m) => ({ hotel_id: m.hotelId, name: hotelOf(m.hotelId).name, slug: hotelOf(m.hotelId).slug, role: m.role }));
  const need = () => { const u = me(); if (!u) throw new Http(401, 'unauthenticated'); return u; };
  const access = (hotelId: string, perm?: string) => {
    const u = need();
    const m = members.find((x) => x.hotelId === hotelId && x.userId === u.id && x.active);
    const role: Role | null = m ? m.role : u.platform && hotelOf(hotelId) ? 'owner' : null;
    if (!role || !hotelOf(hotelId)) throw new Http(403, 'forbidden');
    if (perm && !(ROLE_PERMISSIONS[role] as readonly string[]).includes(perm)) throw new Http(403, 'forbidden', `missing permission ${perm}`);
    return { u, role };
  };
  const hotelRoute = (method: string, path: string, perm: string | null, fn: (c: Ctx & { hotelId: string; role: Role }) => unknown) =>
    route(method, '/api/h/:hotelId' + path, (c) => { const { role } = access(c.params.hotelId, perm ?? undefined); return fn({ ...c, hotelId: c.params.hotelId, role }); });

  // auth
  route('POST', '/api/auth/login', ({ body }) => {
    const u = users.find((x) => x.email.toLowerCase() === String(body?.email ?? '').toLowerCase());
    if (!u || u.password !== body?.password) throw new Http(401, 'invalid_credentials');
    session = u.id; log(null, 'auth.login');
    return { user: userView(u), memberships: membershipsOf(u) };
  });
  route('POST', '/api/auth/logout', () => { session = null; return { ok: true }; });
  route('GET', '/api/auth/me', () => { const u = need(); return { user: userView(u), memberships: membershipsOf(u) }; });
  route('GET', '/api/health', () => ({ ok: true }));

  // público
  const publicHotel = (slug: string) => { const h = hotels.find((x) => x.slug === slug && ['trial', 'active'].includes(x.status)); if (!h) throw new Http(404, 'not_found'); return h; };
  route('GET', '/api/public/:slug', ({ params }) => {
    const h = publicHotel(params.slug);
    return { today: today(), slug: h.slug, name: h.name, city: h.city, country: h.country, languages: h.web_languages, currency: 'USD',
      info: { location: 'Paje, Zanzibar, Tanzania', email: 'demo@zanzibar-boutique.test', phone: '+255 000 000 000', demo: true },
      room_types: roomTypes.filter((t) => t.hotelId === h.id).sort((a, b) => a.base_rate_cents - b.base_rate_cents).map(({ id, name, description_i18n, max_adults, max_children, base_rate_cents }) => ({ id, name, description_i18n, max_adults, max_children, base_rate_cents })) };
  });
  route('GET', '/api/public/:slug/availability', ({ params, q }) => {
    const h = publicHotel(params.slug);
    const ci = q.get('check_in'), co = q.get('check_out');
    if (!isDate(ci) || !isDate(co)) throw new Http(400, 'validation');
    const n = nightsBetween(ci, co); if (n < 1 || n > 60) throw new Http(422, 'invalid_range');
    const ad = Number(q.get('adults') ?? 2), ch = Number(q.get('children') ?? 0);
    const out: any[] = [];
    for (const t of roomTypes.filter((x) => x.hotelId === h.id && x.max_adults >= ad && x.max_children >= ch).sort((a, b) => a.base_rate_cents - b.base_rate_cents)) {
      const left = freeRooms(h.id, ci, co, t.id).length;
      if (left > 0) out.push({ room_type_id: t.id, name: t.name, nights: n, total_cents: priceStay(t.id, ci, co), rooms_left: Math.min(left, 3) });
    }
    return { check_in: ci, check_out: co, currency: 'USD', room_types: out };
  });
  route('POST', '/api/public/:slug/bookings', ({ params, body }) => {
    const h = publicHotel(params.slug);
    if (body?.accept_terms !== true || (body?.website ?? '') !== '' || !/^\S+@\S+\.\S+$/.test(body?.guest?.email ?? '')) throw new Http(400, 'validation');
    const r = createReservation(h.id, body, 'web', LANGS.includes(body.language) ? body.language : 'en');
    const deposit = Math.ceil(r.total_cents * 0.3);
    payments.push({ id: uid('p'), hotelId: h.id, reservation_id: r.id, kind: 'payment', amount_cents: deposit, method: 'card_simulated', simulated: true, reference: 'WEB-SIMULATED', created_at: nowIso() });
    log(h.id, 'payment.payment', 'reservation', r.id, { amount_cents: deposit, simulated: true });
    return created({ code: r.code, check_in: r.check_in, check_out: r.check_out, room_type: typeOf(r.room_type_id).name, total_cents: r.total_cents, deposit_cents: deposit, balance_cents: r.total_cents - deposit, simulated_payment: true });
  });
  route('GET', '/api/public/:slug/bookings/:code', ({ params, q }) => {
    const h = publicHotel(params.slug);
    const r = reservations.find((x) => x.hotelId === h.id && x.code === params.code && (guestOf(x.guest_id).email ?? '').toLowerCase() === (q.get('email') ?? '').toLowerCase());
    if (!r) throw new Http(404, 'not_found');
    const d = detail(r);
    return { code: d.code, status: d.status, check_in: d.check_in, check_out: d.check_out, room_type: d.room_type_name, total_cents: d.total_cents, paid_cents: d.paid_cents, balance_cents: d.balance_cents };
  });

  // hotel
  hotelRoute('GET', '/me', null, ({ hotelId, role }) => {
    const h = hotelOf(hotelId), p = planOf(h.plan);
    return { hotel: { id: h.id, name: h.name, slug: h.slug, timezone: h.timezone, currencies: h.currencies, web_languages: h.web_languages, admin_language: h.admin_language, status: h.status, plan: p.code, max_rooms: p.max_rooms, max_staff: p.max_staff, today: today() }, role, permissions: ROLE_PERMISSIONS[role] };
  });
  hotelRoute('GET', '/staff', 'staff:manage', ({ hotelId }) => members.filter((m) => m.hotelId === hotelId).map((m) => { const u = users.find((x) => x.id === m.userId); return { id: m.id, role: m.role, active: m.active, user_id: u.id, email: u.email, full_name: u.full_name }; }));
  hotelRoute('POST', '/staff', 'staff:manage', ({ hotelId, body }) => {
    const p = planOf(hotelOf(hotelId).plan);
    if (members.filter((m) => m.hotelId === hotelId && m.active).length >= p.max_staff) throw new Http(402, 'plan_limit_staff');
    if (!/^\S+@\S+\.\S+$/.test(body?.email ?? '') || !body?.full_name || String(body?.password ?? '').length < 12 || !(body.role in ROLE_PERMISSIONS)) throw new Http(400, 'validation');
    let u = users.find((x) => x.email.toLowerCase() === body.email.toLowerCase());
    if (!u) { u = { id: uid('u'), email: body.email, full_name: body.full_name, password: body.password }; users.push(u); }
    if (members.some((m) => m.hotelId === hotelId && m.userId === u.id)) throw new Http(409, 'duplicate');
    const m = { id: uid('m'), userId: u.id, hotelId, role: body.role, active: true }; members.push(m); log(hotelId, 'staff.add', 'membership', m.id);
    return created({ id: m.id, role: m.role });
  });
  hotelRoute('PATCH', '/staff/:id', 'staff:manage', ({ hotelId, params, body }) => {
    const m = members.find((x) => x.id === params.id && x.hotelId === hotelId); if (!m) throw new Http(404, 'not_found');
    const role = body.role ?? m.role, active = body.active ?? m.active;
    if (m.role === 'owner' && m.active && (role !== 'owner' || !active) && members.filter((x) => x.hotelId === hotelId && x.role === 'owner' && x.active).length <= 1) throw new Http(409, 'last_owner');
    m.role = role; m.active = active; log(hotelId, 'staff.update', 'membership', m.id);
    return { id: m.id, role, active };
  });
  hotelRoute('GET', '/audit', 'audit:read', ({ hotelId }) => audit.filter((a) => a.hotelId === hotelId).slice(-100).reverse());
  hotelRoute('GET', '/room-types', 'rooms:read', ({ hotelId }) => roomTypes.filter((t) => t.hotelId === hotelId).sort((a, b) => a.base_rate_cents - b.base_rate_cents).map(({ id, name, description, max_adults, max_children, base_rate_cents }) => ({ id, name, description, max_adults, max_children, base_rate_cents })));
  hotelRoute('GET', '/rooms', 'rooms:read', ({ hotelId }) => rooms.filter((r) => r.hotelId === hotelId).sort((a, b) => a.number.localeCompare(b.number)).map((r) => {
    const stay = reservations.find((x) => x.room_id === r.id && x.status === 'checked_in');
    return { id: r.id, number: r.number, floor: r.floor, status: r.status, housekeeping_status: r.housekeeping_status, room_type_id: r.room_type_id, room_type_name: typeOf(r.room_type_id).name, in_house_code: stay?.code ?? null, in_house_guest: stay ? guestOf(stay.guest_id).full_name : null };
  }));
  hotelRoute('PATCH', '/rooms/:id', 'rooms:write', ({ hotelId, params, body }) => {
    const r = rooms.find((x) => x.id === params.id && x.hotelId === hotelId); if (!r) throw new Http(404, 'not_found');
    if (body.status === 'out_of_service' && reservations.some((x) => x.room_id === r.id && ACTIVE.includes(x.status) && x.check_out > today())) throw new Http(409, 'room_has_reservations');
    if (body.status) r.status = body.status; log(hotelId, 'room.update', 'room', r.id, body); return r;
  });
  hotelRoute('PATCH', '/rooms/:id/housekeeping', 'housekeeping:write', ({ hotelId, params, body }) => {
    const r = rooms.find((x) => x.id === params.id && x.hotelId === hotelId); if (!r) throw new Http(404, 'not_found');
    if (!['clean', 'dirty', 'in_progress', 'inspected'].includes(body?.status)) throw new Http(400, 'validation');
    r.housekeeping_status = body.status; log(hotelId, 'housekeeping.update', 'room', r.id, body);
    return { id: r.id, number: r.number, housekeeping_status: r.housekeeping_status };
  });
  hotelRoute('GET', '/rates', 'rooms:read', ({ hotelId }) => rates.filter((r) => r.hotelId === hotelId).sort((a, b) => a.start_date.localeCompare(b.start_date)));
  hotelRoute('POST', '/rates', 'rooms:write', ({ hotelId, body }) => {
    if (!isDate(body?.start_date) || !isDate(body?.end_date) || !typeOf(body?.room_type_id) || !(body.price_cents >= 0)) throw new Http(400, 'validation');
    if (body.end_date <= body.start_date) throw new Http(422, 'invalid_range');
    if (rates.some((x) => x.room_type_id === body.room_type_id && overlaps(x.start_date, x.end_date, body.start_date, body.end_date))) throw new Http(409, 'conflict');
    const r = { id: uid('rp'), hotelId, room_type_id: body.room_type_id, name: body.name, start_date: body.start_date, end_date: body.end_date, price_cents: body.price_cents };
    rates.push(r); log(hotelId, 'rate.create', 'rate_period', r.id); return created(r);
  });
  hotelRoute('DELETE', '/rates/:id', 'rooms:write', ({ hotelId, params }) => {
    const i = rates.findIndex((x) => x.id === params.id && x.hotelId === hotelId); if (i < 0) throw new Http(404, 'not_found');
    rates.splice(i, 1); log(hotelId, 'rate.delete', 'rate_period', params.id); return { ok: true };
  });
  hotelRoute('GET', '/availability', 'reservations:read', ({ hotelId, q }) => {
    const ci = q.get('check_in'), co = q.get('check_out');
    if (!isDate(ci) || !isDate(co)) throw new Http(400, 'validation');
    const n = nightsBetween(ci, co); if (n < 1 || n > 60) throw new Http(422, 'invalid_range');
    const ad = Number(q.get('adults') ?? 1), ch = Number(q.get('children') ?? 0);
    return { check_in: ci, check_out: co, currency: 'USD', room_types: roomTypes.filter((t) => t.hotelId === hotelId && t.max_adults >= ad && t.max_children >= ch).sort((a, b) => a.base_rate_cents - b.base_rate_cents).map((t) => {
      const free = freeRooms(hotelId, ci, co, t.id);
      return { room_type_id: t.id, name: t.name, available: free.length, nights: n, total_cents: priceStay(t.id, ci, co), rooms: free.sort((a, b) => a.number.localeCompare(b.number)).map((r) => ({ id: r.id, number: r.number })) };
    }) };
  });
  hotelRoute('GET', '/guests', 'guests:read', ({ hotelId, q }) => { const s = (q.get('q') ?? '').toLowerCase(); return guests.filter((g) => g.hotelId === hotelId && (!s || g.full_name.toLowerCase().includes(s) || (g.email ?? '').toLowerCase().includes(s))).sort((a, b) => a.full_name.localeCompare(b.full_name)).slice(0, 100); });

  hotelRoute('GET', '/reservations', 'reservations:read', ({ hotelId, q }) => {
    const st = q.get('status')?.split(',').filter(Boolean), from = q.get('from'), to = q.get('to'), s = (q.get('q') ?? '').toLowerCase();
    return reservations.filter((r) => r.hotelId === hotelId && (!st || st.includes(r.status)) && (!from || r.check_out > from) && (!to || r.check_in <= to)
      && (!s || r.code.toLowerCase().includes(s) || guestOf(r.guest_id).full_name.toLowerCase().includes(s)))
      .sort((a, b) => b.check_in.localeCompare(a.check_in) || b.created_at.localeCompare(a.created_at)).slice(0, 200).map(view);
  });
  const resOf = (hotelId: string, id: string) => { const r = reservations.find((x) => x.id === id && x.hotelId === hotelId); if (!r) throw new Http(404, 'not_found'); return r; };
  hotelRoute('GET', '/reservations/:id', 'reservations:read', ({ hotelId, params }) => detail(resOf(hotelId, params.id)));
  hotelRoute('POST', '/reservations', 'reservations:write', ({ hotelId, body }) => created(detail(createReservation(hotelId, body ?? {}, SOURCES.includes(body?.source) ? body.source : 'direct'))));
  const SOURCES = ['direct', 'web', 'phone', 'walk_in', 'booking_com', 'airbnb', 'other'];
  hotelRoute('PATCH', '/reservations/:id', 'reservations:write', ({ hotelId, params, body }) => {
    const r = resOf(hotelId, params.id);
    if (!ACTIVE.includes(r.status)) throw new Http(409, 'invalid_state');
    const ci = body.check_in ?? r.check_in, co = body.check_out ?? r.check_out;
    if (!isDate(ci) || !isDate(co)) throw new Http(400, 'validation');
    if (r.status === 'checked_in' && ci !== r.check_in) throw new Http(409, 'invalid_state');
    const n = nightsBetween(ci, co); if (n < 1 || n > 60) throw new Http(422, 'invalid_range');
    if (ci !== r.check_in && ci < today()) throw new Http(422, 'past_date');
    if (reservations.some((x) => x.id !== r.id && x.room_id === r.room_id && ACTIVE.includes(x.status) && overlaps(x.check_in, x.check_out, ci, co))) throw new Http(409, 'conflict', 'La habitación ya está ocupada en esas fechas');
    r.check_in = ci; r.check_out = co; r.total_cents = priceStay(r.room_type_id, ci, co); if (body.notes !== undefined) r.notes = body.notes;
    log(hotelId, 'reservation.update', 'reservation', r.id); return detail(r);
  });
  hotelRoute('POST', '/reservations/:id/assign-room', 'reservations:write', ({ hotelId, params, body }) => {
    const r = resOf(hotelId, params.id);
    if (!['pending', 'confirmed'].includes(r.status)) throw new Http(409, 'invalid_state');
    if (!freeRooms(hotelId, r.check_in, r.check_out, r.room_type_id, r.id).some((x) => x.id === body?.room_id)) throw new Http(409, 'room_unavailable');
    r.room_id = body.room_id; log(hotelId, 'reservation.assign_room', 'reservation', r.id); return detail(r);
  });
  hotelRoute('POST', '/reservations/:id/check-in', 'reservations:write', ({ hotelId, params }) => {
    const r = resOf(hotelId, params.id);
    if (r.status !== 'confirmed') throw new Http(409, 'invalid_state');
    if (today() < r.check_in) throw new Http(409, 'too_early');
    if (today() >= r.check_out) throw new Http(409, 'stay_over');
    const rm = roomOf(r.room_id);
    if (rm.status !== 'available' || !['clean', 'inspected'].includes(rm.housekeeping_status)) throw new Http(409, 'room_not_ready', `La habitación ${rm.number} no está lista (limpieza: ${rm.housekeeping_status})`);
    r.status = 'checked_in'; r.checked_in_at = nowIso(); log(hotelId, 'reservation.check_in', 'reservation', r.id); return detail(r);
  });
  hotelRoute('POST', '/reservations/:id/check-out', 'reservations:write', ({ hotelId, params, body, role }) => {
    const r = resOf(hotelId, params.id);
    if (r.status !== 'checked_in') throw new Http(409, 'invalid_state');
    const d = detail(r);
    if (d.balance_cents > 0 && !(body?.allow_balance && (ROLE_PERMISSIONS[role] as readonly string[]).includes('reservations:override'))) throw new Http(409, 'balance_due');
    r.status = 'checked_out'; r.checked_out_at = nowIso(); roomOf(r.room_id).housekeeping_status = 'dirty';
    log(hotelId, 'reservation.check_out', 'reservation', r.id, { balance_cents: d.balance_cents, overridden: d.balance_cents > 0 }); return detail(r);
  });
  hotelRoute('POST', '/reservations/:id/cancel', 'reservations:write', ({ hotelId, params, body }) => {
    const r = resOf(hotelId, params.id);
    if (!['pending', 'confirmed'].includes(r.status)) throw new Http(409, 'invalid_state');
    r.status = 'cancelled'; log(hotelId, 'reservation.cancel', 'reservation', r.id, body); return detail(r);
  });
  hotelRoute('POST', '/reservations/:id/payments', 'payments:write', ({ hotelId, params, body }) => {
    const r = resOf(hotelId, params.id); const d = detail(r);
    const amount = Number(body?.amount_cents), kind = body?.kind ?? 'payment';
    if (!Number.isInteger(amount) || amount < 1 || !['cash', 'card_simulated', 'transfer'].includes(body?.method) || !['payment', 'refund'].includes(kind)) throw new Http(400, 'validation');
    if (kind === 'payment') { if (r.status === 'cancelled') throw new Http(409, 'invalid_state'); if (amount > d.balance_cents) throw new Http(422, 'overpayment'); }
    else if (amount > d.paid_cents) throw new Http(422, 'refund_exceeds_paid');
    payments.push({ id: uid('p'), hotelId, reservation_id: r.id, kind, amount_cents: amount, method: body.method, simulated: true, reference: body.reference ?? null, created_at: nowIso() });
    log(hotelId, `payment.${kind}`, 'reservation', r.id, { amount_cents: amount, simulated: true }); return created(detail(r));
  });
  hotelRoute('POST', '/reservations/:id/extras', 'extras:write', ({ hotelId, params, body }) => {
    const r = resOf(hotelId, params.id);
    if (!ACTIVE.includes(r.status)) throw new Http(409, 'invalid_state');
    if (!['excursion', 'transfer', 'restaurant', 'other'].includes(body?.kind) || !body?.description || !(body.unit_price_cents >= 0)) throw new Http(400, 'validation');
    extras.push({ id: uid('x'), hotelId, reservation_id: r.id, kind: body.kind, description: body.description, quantity: body.quantity ?? 1, unit_price_cents: body.unit_price_cents, service_date: body.service_date ?? null });
    log(hotelId, 'extra.add', 'reservation', r.id, body); return created(detail(r));
  });
  hotelRoute('GET', '/frontdesk', 'reservations:read', ({ hotelId }) => {
    const t = today(), rs = reservations.filter((r) => r.hotelId === hotelId), by = (f: (r: any) => boolean) => rs.filter(f).sort((a, b) => roomOf(a.room_id).number.localeCompare(roomOf(b.room_id).number)).map((r) => ({ ...view(r) }));
    return { today: t, arrivals: by((r) => r.status === 'confirmed' && r.check_in === t), departures: by((r) => r.status === 'checked_in' && r.check_out === t), in_house: by((r) => r.status === 'checked_in') };
  });
  hotelRoute('GET', '/reports/occupancy', 'reports:read', ({ hotelId, q }) => {
    const from = q.get('from'), to = q.get('to');
    if (!isDate(from) || !isDate(to)) throw new Http(400, 'validation');
    const n = nightsBetween(from, to); if (n < 1 || n > 366) throw new Http(422, 'invalid_range');
    const total = rooms.filter((r) => r.hotelId === hotelId && r.status === 'available').length;
    const days = Array.from({ length: n }, (_v, i) => { const d = addDays(from, i);
      const occ = reservations.filter((r) => r.hotelId === hotelId && ['confirmed', 'checked_in', 'checked_out'].includes(r.status) && d >= r.check_in && d < r.check_out).length;
      return { date: d, rooms: total, occupied: occ, occupancy_pct: total ? Math.round((occ / total) * 1000) / 10 : 0 }; });
    const sold = days.reduce((s, d) => s + d.occupied, 0), avail = days.reduce((s, d) => s + d.rooms, 0);
    return { from, to, days, occupancy_pct: avail ? Math.round((sold / avail) * 1000) / 10 : 0 };
  });
  hotelRoute('GET', '/reports/revenue', 'reports:read', ({ hotelId, q }) => {
    const from = q.get('from'), to = q.get('to');
    if (!isDate(from) || !isDate(to)) throw new Http(400, 'validation');
    const day = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);
    const collected = payments.filter((p) => p.hotelId === hotelId && day(p.created_at) >= from && day(p.created_at) <= to).reduce((s, p) => s + (p.kind === 'payment' ? p.amount_cents : -p.amount_cents), 0);
    const rs = reservations.filter((r) => r.hotelId === hotelId && ['confirmed', 'checked_in', 'checked_out'].includes(r.status) && r.check_in >= from && r.check_in <= to);
    const lodging = rs.reduce((s, r) => s + r.total_cents, 0), ex = rs.reduce((s, r) => s + extrasOf(r.id), 0);
    return { from, to, currency: 'USD', simulated_payments: true, collected_cents: collected, lodging_cents: lodging, extras_cents: ex, booked_cents: lodging + ex };
  });
  hotelRoute('GET', '/payments', 'payments:read', ({ hotelId, q }) => {
    const from = q.get('from'), to = q.get('to'), day = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);
    return payments.filter((p) => p.hotelId === hotelId && (!from || day(p.created_at) >= from) && (!to || day(p.created_at) <= to)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 300)
      .map((p) => { const r = reservations.find((x) => x.id === p.reservation_id); return { id: p.id, kind: p.kind, amount_cents: p.amount_cents, method: p.method, simulated: true, reference: p.reference, created_at: p.created_at, reservation_id: r.id, code: r.code, guest_name: guestOf(r.guest_id).full_name }; });
  });

  // plataforma
  const platform = () => { const u = need(); if (!u.platform) throw new Http(403, 'forbidden'); };
  route('GET', '/api/platform/plans', () => { platform(); return plans; });
  route('GET', '/api/platform/hotels', () => { platform(); return hotels.map((h) => ({ id: h.id, slug: h.slug, name: h.name, city: h.city, status: h.status, plan: h.plan, rooms: rooms.filter((r) => r.hotelId === h.id).length, staff: members.filter((m) => m.hotelId === h.id && m.active).length })); });
  route('POST', '/api/platform/hotels', ({ body }) => {
    platform();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(body?.slug ?? '') || !body?.name || !planOf(body.plan_code ?? 'starter') || String(body?.owner?.password ?? '').length < 12 || !/^\S+@\S+\.\S+$/.test(body?.owner?.email ?? '')) throw new Http(400, 'validation');
    if (hotels.some((h) => h.slug === body.slug)) throw new Http(409, 'duplicate');
    const h = { id: uid('hotel'), slug: body.slug, name: body.name, city: body.city ?? null, country: 'TZ', timezone: 'Africa/Dar_es_Salaam', currencies: ['USD'], web_languages: LANGS, admin_language: 'ro', plan: body.plan_code ?? 'starter', status: 'trial' };
    hotels.push(h);
    let u = users.find((x) => x.email.toLowerCase() === body.owner.email.toLowerCase());
    if (!u) { u = { id: uid('u'), email: body.owner.email, full_name: body.owner.full_name, password: body.owner.password }; users.push(u); }
    members.push({ id: uid('m'), userId: u.id, hotelId: h.id, role: 'owner', active: true }); log(h.id, 'hotel.create', 'hotel', h.id);
    return created({ id: h.id, slug: h.slug, name: h.name });
  });

  // ---------- despacho ----------
  return async function handle(r: Req): Promise<Res> {
    const u = new URL(r.url, 'http://local');
    const send = (status: number, data: unknown): Res => ({ status, headers: { 'content-type': 'application/json; charset=utf-8' }, body: data === undefined ? '' : JSON.stringify(data), cookies: [] });
    try {
      const method = r.method.toUpperCase();
      for (const rt of table) {
        if (rt.method !== method) continue;
        const m = rt.re.exec(u.pathname); if (!m) continue;
        const params: Record<string, string> = {}; rt.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        let body: any; try { body = r.body ? JSON.parse(r.body) : {}; } catch { throw new Http(400, 'validation'); }
        // pequeña espera para que el arranque (scrypt en el real) se note menos artificial
        const out: any = await rt.fn({ params, q: u.searchParams, body });
        return out && out.__status ? send(out.__status, out.data) : send(200, out);
      }
      throw new Http(404, 'not_found');
    } catch (e) {
      if (e instanceof Http) return send(e.status, { error: e.code, message: e.message });
      console.error(e);
      return send(500, { error: 'internal' });
    }
  };
}
