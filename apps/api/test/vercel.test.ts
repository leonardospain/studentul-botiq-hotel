import { describe, expect, it, vi } from 'vitest';

// Simula el entorno de Vercel ANTES de cargar la configuración.
vi.hoisted(() => { process.env.VERCEL = '1'; });
import { buildApp } from '../src/app.js';
import { MIGRATIONS } from '../src/migrations.generated.js';

describe('servicio API en Vercel', () => {
  it('responde igual si el prefijo /api llega intacto o recortado', async () => {
    const app = await buildApp();
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/auth/me' })).statusCode).toBe(401); // llega a /api/auth/me
    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
    await app.close();
  });

  it('las migraciones incrustadas coinciden con los .sql (ver npm run migrations:check)', () => {
    expect(MIGRATIONS.map((m) => m.name)).toEqual(['001_core.sql', '002_pms.sql', '003_public.sql']);
    expect(MIGRATIONS.every((m) => m.sql.length > 100)).toBe(true);
  });
});
