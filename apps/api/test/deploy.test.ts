import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import handler from '../../../api/index.js';
import { assertSafeRole, pool } from '../src/db.js';
import { resetDb, PASSWORD } from './helpers.js';

let server: http.Server; let base: string; let Z: string;
beforeAll(async () => {
  const seed = await resetDb(); Z = seed.hotels['zanzibar-boutique'];
  server = http.createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

describe('entrada serverless (api/index.ts)', () => {
  it('el rol de la aplicación pasa la comprobación de arranque seguro', async () => {
    await expect(assertSafeRole()).resolves.toBeUndefined();
  });

  it('atiende health, login con cookie y rutas de hotel a través del handler', async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@zanzibar.test', password: PASSWORD }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const rooms = await fetch(`${base}/api/h/${Z}/rooms`, { headers: { cookie } });
    expect(rooms.status).toBe(200);
    expect(await rooms.json()).toHaveLength(15);
    const pub = await fetch(`${base}/api/public/zanzibar-boutique`);
    expect((await pub.json()).name).toBe('Zanzibar Boutique Hotel');
  });
});
