// Comprobación de humo contra la demo publicada. Uso: BASE=https://… DEMO_PASSWORD=… PLATFORM_PASSWORD=… node scripts/remote-smoke.mjs
const BASE = (process.env.BASE ?? '').replace(/\/$/, '');
if (!BASE) { console.error('Indica BASE=https://tu-demo'); process.exit(1); }
let n = 0; const ok = (c, m) => { if (!c) { console.error('✗ FALLO:', m); process.exit(1); } console.log('  ✓', m); n++; };
const login = async (email, password) => {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return { r, cookie: (r.headers.get('set-cookie') ?? '').split(';')[0], body: await r.json().catch(() => ({})) };
};
const get = (p, cookie) => fetch(`${BASE}${p}`, { headers: cookie ? { cookie } : {} });

ok((await get('/api/health')).status === 200, 'API responde');
ok((await get('/')).status === 200, 'Web responde');
const pub = await (await get('/api/public/zanzibar-boutique')).json();
ok(pub.room_types?.length === 3, 'Información pública del hotel');
const owner = await login('owner@zanzibar.test', process.env.DEMO_PASSWORD);
ok(owner.r.status === 200, 'Login del propietario');
const zid = owner.body.memberships[0].hotel_id;
ok((await (await get(`/api/h/${zid}/rooms`, owner.cookie)).json()).length === 15, 'El propietario ve sus 15 habitaciones (RLS con contexto activo)');
const plat = await login('platform@botiq.test', process.env.PLATFORM_PASSWORD ?? process.env.DEMO_PASSWORD);
const hotels = await (await get('/api/platform/hotels', plat.cookie)).json();
const other = hotels.find((h) => h.slug === 'otro-hotel-demo');
ok(!!other, 'La plataforma ve ambos hoteles');
ok((await get(`/api/h/${other.id}/rooms`, owner.cookie)).status === 403, 'El propietario NO accede al otro hotel');
const o2 = await login('owner@otro.test', process.env.DEMO_PASSWORD);
const ids = (await (await get(`/api/h/${other.id}/rooms`, o2.cookie)).json()).map((r) => r.id);
ok(ids.length === 2, 'El otro hotel solo ve sus 2 habitaciones (sin mezcla entre hoteles)');
ok((await get(`/api/h/${zid}/rooms`, o2.cookie)).status === 403, 'Acceso cruzado inverso bloqueado');
console.log(`\nSMOKE OK: ${n} comprobaciones`);
