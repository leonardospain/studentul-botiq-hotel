// Prueba extremo a extremo con navegador real (Playwright). Requiere el servidor en BASE (por defecto http://127.0.0.1:3111)
// con la web compilada y datos demo cargados (npm run seed con DEMO_PASSWORD).
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://127.0.0.1:3111';
const PASS = process.env.DEMO_PASSWORD ?? 'Demo-Password-123!';
const SHOTS = process.env.SHOTS ?? '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
let n = 0;
const ok = (c, m) => { if (!c) throw new Error('FALLO: ' + m); console.log('  ✓', m); n++; };
// Fecha en la zona horaria del hotel (Africa/Dar_es_Salaam, UTC+3 sin horario de verano)
const iso = (d) => new Date(Date.now() + 3 * 36e5 + d * 864e5).toISOString().slice(0, 10);

const browser = await chromium.launch();
const errors = [];
const mk = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/401|409|404|422/.test(m.text()) && errors.push(m.text()));
  return page;
};

console.log('1. Web pública y multilingüe');
let page = await mk({ locale: 'en-GB' });
await page.goto(BASE + '/#/');
await page.waitForSelector('.hero h1');
ok((await page.textContent('.hero h1')).includes('Indian Ocean'), 'Home en inglés');
await page.screenshot({ path: `${SHOTS}/01-home-en.png` });
for (const [l, expect] of [['ro', 'Unde Oceanul Indian'], ['es', 'Donde el océano Índico'], ['it', "Dove l'Oceano Indiano"], ['fr', "Là où l'océan Indien"]]) {
  await page.selectOption('select.lang', l);
  ok((await page.textContent('.hero h1')).includes(expect), `Idioma ${l}`);
}
await page.selectOption('select.lang', 'ro');
await page.screenshot({ path: `${SHOTS}/02-home-ro.png`, fullPage: true });
await page.reload(); await page.waitForSelector('.hero h1');
ok((await page.textContent('.hero h1')).includes('Unde'), 'El idioma se recuerda tras recargar');

console.log('2. Reserva pública de principio a fin');
await page.click('nav >> text=Rezervă');
await page.fill('input[type=date] >> nth=0', iso(20)); await page.fill('input[type=date] >> nth=1', iso(23));
await page.click('button:has-text("Caută")');
await page.waitForSelector('text=Camere disponibile');
ok((await page.locator('.card.opt').count()) === 3, '3 tipos de habitación disponibles');
await page.screenshot({ path: `${SHOTS}/03-book-results.png`, fullPage: true });
await page.locator('.card.opt >> nth=1').locator('button').click();
await page.fill('input[autocomplete=name]', 'Elena Popescu'); await page.fill('input[type=email]', 'elena@example.test');
await page.check('input[type=checkbox]');
await page.screenshot({ path: `${SHOTS}/04-book-details.png`, fullPage: true });
await page.click('button:has-text("Confirmă rezervarea")');
await page.waitForSelector('[data-testid=code]');
const code = (await page.textContent('[data-testid=code]')).trim();
ok(/^BH-[A-Z0-9]{6}$/.test(code), `Reserva creada con código ${code}`);
await page.screenshot({ path: `${SHOTS}/05-book-done.png`, fullPage: true });
await page.click('text=Vezi rezervarea');
await page.waitForSelector('dl.kv >> text=Confirmată');
ok(true, 'Consulta por código + email muestra "Confirmată"');

console.log('3. Panel administrativo en rumano (recepción)');
// En la demo autónoma (STANDALONE=1) la base de datos vive en cada pestaña: se usa la MISMA pestaña, como haría una persona real.
const adm = process.env.STANDALONE ? page : await mk({ locale: 'ro-RO' });
await adm.goto(BASE + '/#/admin');
await adm.fill('input[type=email]', 'reception@zanzibar.test'); await adm.fill('input[type=password]', 'mala-clave-123');
await adm.click('button:has-text("Autentificare")');
await adm.waitForSelector('[role=alert]');
ok((await adm.textContent('[role=alert]')).includes('incorecte'), 'Login erróneo muestra error en rumano');
await adm.fill('input[type=password]', PASS); await adm.click('button:has-text("Autentificare")');
await adm.waitForSelector('text=Panou de control');
await adm.screenshot({ path: `${SHOTS}/06-admin-dashboard.png`, fullPage: true });
ok((await adm.locator('.side a').allTextContents()).join('|').includes('Rezervări'), 'Menú con Rezervări');
ok(!(await adm.locator('.side a').allTextContents()).join('|').includes('Personal'), 'Recepción no ve gestión de personal');
await adm.click('.side >> text=Rezervări');
await adm.waitForSelector(`tr:has-text("${code}")`);
ok(true, 'La reserva web aparece en el panel');
await adm.click(`tr:has-text("${code}")`);
await adm.waitForSelector('.drawer dl.kv');
ok((await adm.textContent('.drawer')).includes('Site web'), 'Detalle: origen "Site web"');
await adm.screenshot({ path: `${SHOTS}/07-admin-detail.png` });
await adm.keyboard.press('Escape');

console.log('4. Reserva nueva hoy → check-in → saldo → pago → check-out');
await adm.click('button:has-text("+ Rezervare nouă")');
await adm.fill('.drawer label:has-text("Nume oaspete") input', 'Marco Rossi');
await adm.fill('.drawer label:has-text("Sosire") input', iso(0)); await adm.fill('.drawer label:has-text("Plecare") input', iso(2));
await adm.click('.drawer button:has-text("Creează rezervarea")');
await adm.waitForSelector('.drawer >> text=Marco Rossi');
await adm.click('.drawer button:has-text("Check-in")');
await adm.waitForSelector('.drawer .badge:has-text("Cazat")');
ok(true, 'Check-in efectuado: estado "Cazat"');
await adm.click('.drawer button:has-text("Check-out")');
await adm.waitForSelector('.toast.bad');
ok((await adm.textContent('.toast')).includes('sold'), 'Check-out bloqueado con saldo pendiente');
await adm.fill('.drawer summary:has-text("Excursii") ~ *, .drawer form:has-text("Excursii") label:has-text("Descriere") input', 'Safari Blue');
await adm.fill('.drawer form:has-text("Excursii") label:has-text("Preț") input', '65');
await adm.click('.drawer form:has-text("Excursii") button:has-text("Adaugă")');
await adm.waitForSelector('.drawer td:has-text("Safari Blue")');
ok(true, 'Excursión añadida a la reserva');
const balance = await adm.locator('.drawer dl.kv dd').last().textContent();
await adm.fill('.drawer form:has-text("SIMULATĂ") input[inputmode=decimal]', String(parseFloat(balance.replace(/[^\d,]/g, '').replace(',', '.'))));
await adm.click('.drawer form:has-text("SIMULATĂ") button:has-text("Înregistrează")');
await adm.waitForFunction(() => document.querySelector('.drawer dl.kv dd:last-of-type')?.textContent?.includes('0,00'));
ok(true, 'Pago simulado salda la reserva');
await adm.click('.drawer button:has-text("Check-out")');
await adm.waitForSelector('.drawer .badge:has-text("Check-out efectuat")');
ok(true, 'Check-out efectuado');

console.log('5. Limpieza: la habitación queda sucia');
await adm.keyboard.press('Escape');
await adm.click('.side >> text=Camere');
await adm.waitForSelector('.rooms-grid');
ok((await adm.locator('.room .badge:has-text("De curățat")').count()) >= 1, 'Habitación pasa a "De curățat"');
await adm.screenshot({ path: `${SHOTS}/08-admin-rooms.png`, fullPage: true });

console.log('6. Informes');
if (process.env.STANDALONE) await adm.click('.side >> text=Panou'); else await adm.goto(BASE + '/#/admin');
await adm.waitForSelector('text=Panou de control');
await adm.screenshot({ path: `${SHOTS}/09-admin-dashboard-after.png`, fullPage: true });

console.log('7. Permisos por rol en la interfaz');
const hk = await mk({ locale: 'ro-RO' });
await hk.goto(BASE + '/#/admin');
await hk.fill('input[type=email]', 'housekeeping@zanzibar.test'); await hk.fill('input[type=password]', PASS);
await hk.click('button:has-text("Autentificare")');
await hk.waitForSelector('.side');
const links = (await hk.locator('.side a').allTextContents()).join('|');
ok(links.includes('Camere') && !links.includes('Rezervări') && !links.includes('Plăți'), 'Cameristă solo ve Camere');
const own = await mk({ locale: 'ro-RO' });
await own.goto(BASE + '/#/admin');
await own.fill('input[type=email]', 'platform@botiq.test'); await own.fill('input[type=password]', PASS);
await own.click('button:has-text("Autentificare")');
await own.waitForSelector('.side');
await own.click('.side >> text=Hoteluri și planuri');
await own.waitForSelector('text=Platformă SaaS');
ok((await own.locator('tbody tr').count()) >= 5, 'Administrador de plataforma ve planes y hoteles');
await own.screenshot({ path: `${SHOTS}/10-platform.png`, fullPage: true });

console.log('8. Móvil');
const mob = await mk({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' });
await mob.goto(BASE + '/#/book'); await mob.waitForSelector('h2');
ok(await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Web pública sin scroll horizontal en móvil');
await mob.screenshot({ path: `${SHOTS}/11-mobile-book.png`, fullPage: true });
await mob.goto(BASE + '/#/admin');
await mob.fill('input[type=email]', 'reception@zanzibar.test'); await mob.fill('input[type=password]', PASS);
await mob.click('button:has-text("Autentificare")'); await mob.waitForSelector('text=Panou de control');
ok(await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Panel sin scroll horizontal en móvil');
await mob.screenshot({ path: `${SHOTS}/12-mobile-admin.png` });

await browser.close();
ok(errors.length === 0, `Sin errores de consola/JS${errors.length ? ': ' + errors.join(' | ') : ''}`);
console.log(`\nE2E OK: ${n} comprobaciones`);
