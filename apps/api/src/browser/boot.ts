import './shims/process.js';
import { createShimApp, type ShimRequest, type ShimResponse } from './fastify-shim.js';
import { configureApp } from '../app-core.js';
import { setPool, assertSafeRole } from '../db.js';
import { createPglite } from '../pglite.js';

/** Arranca la "API" dentro del navegador: PostgreSQL embebido + rutas reales. */
export async function bootBrowserApi(demoPassword: string): Promise<(r: ShimRequest) => Promise<ShimResponse>> {
  (globalThis as any).__BOTIQ_ENV__.DEMO_PASSWORD = demoPassword;
  setPool(await createPglite());
  await assertSafeRole();
  const app = createShimApp();
  await configureApp(app);
  return app.handle;
}
