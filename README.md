# STUDENTUL BOTIQ HOTEL

SaaS multi-tenant de gestión hotelera para hoteles boutique (primer hotel demo: Zanzibar Boutique Hotel, Paje).

**Estado:** API + PostgreSQL, web pública multilingüe (RO/EN/ES/IT/FR) con reserva y pago **simulado**, y panel administrativo en rumano. Probado en local. **No está desplegado**; hay un kit de despliegue de demo sin verificar en la nube ([`docs/DEPLOY_DEMO.md`](docs/DEPLOY_DEMO.md)). Sin copias de seguridad, sin channel manager, sin TZS, sin contabilidad/turnos/inventario todavía.

Arquitectura y estado por fase: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```bash
npm install
npm run db:setup && npm run migrate && DEMO_PASSWORD='elige-una-clave-larga' npm run seed
npm run build -w apps/web && PORT=3000 npm start -w apps/api     # http://127.0.0.1:3000
npm test                                                         # API, requiere PostgreSQL local
```

Datos y precios de demostración son ficticios. Los pagos son simulados y la base de datos impide registrar pagos reales.
