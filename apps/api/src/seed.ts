import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';
import { config } from './config.js';
import { hashPassword } from './password.js';

// DATOS FICTICIOS de demostración. Precios y planes son valores de prueba, no una oferta comercial.
const PLANS = [
  ['starter', 'Starter (demo)', 4900, 20, 10],
  ['growth', 'Growth (demo)', 14900, 60, 40],
  ['scale', 'Scale (demo)', 39900, 200, 150],
] as const;

export type SeedResult = { password: string; hotels: Record<string, string>; users: Record<string, string> };

export async function seedDemo(url = config.migrateUrl, password = process.env.DEMO_PASSWORD ?? crypto.randomBytes(9).toString('base64url'), platformPassword = process.env.PLATFORM_PASSWORD ?? password): Promise<SeedResult> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try { return await seedDemoWith(c, password, platformPassword); } finally { await c.end(); }
}

/** Carga los datos ficticios con cualquier cliente SQL (pg o PGlite). */
export async function seedDemoWith(c: { query: (text: string, params?: any[]) => Promise<any> }, password: string, platformPassword: string = password): Promise<SeedResult> {
  const hash = await hashPassword(password);
  const platformHash = platformPassword === password ? hash : await hashPassword(platformPassword);
  const out: SeedResult = { password, hotels: {}, users: {} };
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.platform','on',true)`);
    for (const [code, name, price, rooms, staff] of PLANS)
      await c.query(`INSERT INTO plans(code,name,price_usd_cents_month,max_rooms,max_staff) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO NOTHING`, [code, name, price, rooms, staff]);
    const plan = async (code: string) => (await c.query('SELECT id FROM plans WHERE code=$1', [code])).rows[0].id;

    const user = async (email: string, name: string, platformAdmin = false) => {
      const r = await c.query(
        `INSERT INTO users(email,password_hash,full_name,is_platform_admin) VALUES ($1,$2,$3,$4)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`, [email, platformAdmin ? platformHash : hash, name, platformAdmin]);
      out.users[email] = r.rows[0].id;
      return r.rows[0].id as string;
    };
    const hotel = async (slug: string, name: string, city: string, planCode: string) => {
      const r = await c.query(
        `INSERT INTO hotels(slug,name,city,plan_id,status) VALUES ($1,$2,$3,$4,'active')
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [slug, name, city, await plan(planCode)]);
      await c.query(`INSERT INTO subscriptions(hotel_id,plan_id,status) SELECT $1,$2,'active' WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE hotel_id=$1)`, [r.rows[0].id, await plan(planCode)]);
      out.hotels[slug] = r.rows[0].id;
      return r.rows[0].id as string;
    };
    const member = (h: string, u: string, role: string) =>
      c.query(`INSERT INTO memberships(hotel_id,user_id,role) VALUES ($1,$2,$3) ON CONFLICT (hotel_id,user_id) DO UPDATE SET role=EXCLUDED.role, active=true`, [h, u, role]);

    await user('platform@botiq.test', 'Administrador de plataforma', true);

    const z = await hotel('zanzibar-boutique', 'Zanzibar Boutique Hotel', 'Paje', 'starter');
    await member(z, await user('owner@zanzibar.test', 'Propietar Zanzibar'), 'owner');
    await member(z, await user('manager@zanzibar.test', 'Manager Zanzibar'), 'manager');
    await member(z, await user('reception@zanzibar.test', 'Recepție Zanzibar'), 'receptionist');
    await member(z, await user('housekeeping@zanzibar.test', 'Curățenie Zanzibar'), 'housekeeping');
    await member(z, await user('accounting@zanzibar.test', 'Contabil Zanzibar'), 'accountant');

    const I18N: Record<string, Record<string, string>> = {
      'Garden Room': {
        ro: 'Cameră cu grădină tropicală, terasă privată și baie cu duș exterior.',
        en: 'Room opening onto a tropical garden, with a private terrace and outdoor shower.',
        es: 'Habitación con jardín tropical, terraza privada y ducha exterior.',
        it: 'Camera con giardino tropicale, terrazza privata e doccia esterna.',
        fr: 'Chambre sur jardin tropical, terrasse privée et douche extérieure.' },
      'Ocean View': {
        ro: 'Cameră cu vedere spre Oceanul Indian și balcon amenajat.',
        en: 'Room with Indian Ocean views and a furnished balcony.',
        es: 'Habitación con vistas al océano Índico y balcón amueblado.',
        it: "Camera con vista sull'Oceano Indiano e balcone arredato.",
        fr: "Chambre avec vue sur l'océan Indien et balcon aménagé." },
      'Beach Suite': {
        ro: 'Suită direct pe plajă, cu living separat și piscină privată.',
        en: 'Beachfront suite with a separate living area and private plunge pool.',
        es: 'Suite frente a la playa, con salón independiente y piscina privada.',
        it: 'Suite fronte spiaggia con salotto separato e piscina privata.',
        fr: 'Suite en bord de plage avec salon séparé et piscine privée.' },
    };
    await c.query(`UPDATE hotels SET public_info = $2 WHERE id = $1`, [z, JSON.stringify({
      tagline: { ro: 'Un refugiu tropical boutique pe coasta Paje', en: 'A tropical boutique retreat on the Paje coast', es: 'Un refugio boutique tropical en la costa de Paje', it: 'Un rifugio boutique tropicale sulla costa di Paje', fr: 'Un refuge boutique tropical sur la côte de Paje' },
      location: 'Paje, Zanzibar, Tanzania',
      email: 'demo@zanzibar-boutique.test', phone: '+255 000 000 000', demo: true,
    })]);
    const types: [string, string, number, number, number, number[]][] = [
      ['Garden Room', 'Habitación con jardín tropical', 2, 1, 14000, [101, 102, 103, 104, 105, 106]],
      ['Ocean View', 'Habitación con vista al mar', 2, 2, 19000, [201, 202, 203, 204, 205, 206]],
      ['Beach Suite', 'Suite frente a la playa', 3, 2, 32000, [301, 302, 303]],
    ];
    for (const [name, desc, ad, ch, rate, nums] of types) {
      const t = (await c.query(
        `INSERT INTO room_types(hotel_id,name,description,max_adults,max_children,base_rate_cents) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (hotel_id,name) DO UPDATE SET base_rate_cents=EXCLUDED.base_rate_cents RETURNING id`, [z, name, desc, ad, ch, rate])).rows[0].id;
      await c.query(`UPDATE room_types SET description_i18n = $2 WHERE id = $1`, [t, JSON.stringify(I18N[name])]);
      for (const n of nums)
        await c.query(`INSERT INTO rooms(hotel_id,room_type_id,number,floor) VALUES ($1,$2,$3,$4) ON CONFLICT (hotel_id,number) DO NOTHING`, [z, t, String(n), Math.floor(n / 100) - 1]);
      for (const [label, s, e, mult] of [['Alta temporada verano', '2026-07-01', '2026-09-01', 1.3], ['Alta temporada invierno', '2026-12-15', '2027-01-10', 1.4]] as const)
        await c.query(`INSERT INTO rate_periods(hotel_id,room_type_id,name,start_date,end_date,price_cents)
                       SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS (SELECT 1 FROM rate_periods WHERE room_type_id=$2 AND name=$3)`, [z, t, label, s, e, Math.round(rate * mult)]);
    }

    // Segundo hotel: sirve para demostrar y probar el aislamiento entre tenants.
    const o = await hotel('otro-hotel-demo', 'Otro Hotel (demo)', 'Nungwi', 'starter');
    await member(o, await user('owner@otro.test', 'Owner Otro Hotel'), 'owner');
    const ot = (await c.query(
      `INSERT INTO room_types(hotel_id,name,max_adults,max_children,base_rate_cents) VALUES ($1,'Standard',2,0,9000)
       ON CONFLICT (hotel_id,name) DO UPDATE SET base_rate_cents=9000 RETURNING id`, [o])).rows[0].id;
    for (const n of ['1', '2']) await c.query(`INSERT INTO rooms(hotel_id,room_type_id,number) VALUES ($1,$2,$3) ON CONFLICT (hotel_id,number) DO NOTHING`, [o, ot, n]);

    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (config.isProduction) { console.error('seed deshabilitado en producción'); process.exit(1); }
  seedDemo().then((r) => {
    console.log('Datos de demostración cargados (FICTICIOS).');
    console.log(`Contraseña de todos los usuarios demo: ${r.password}`);
    console.log('Usuarios:', Object.keys(r.users).join(', '));
  }).catch((e) => { console.error(e); process.exit(1); });
}
