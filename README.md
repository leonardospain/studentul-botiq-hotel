# STUDENTUL BOTIQ HOTEL

SaaS multi-tenant de gestión hotelera para hoteles boutique (primer hotel demo: Zanzibar Boutique Hotel, Paje).

**Estado honesto:** backend (API + PostgreSQL) implementado y probado hasta reservas, check-in/out, pagos simulados e informes. **Aún no hay interfaz web** (pública ni de administración), ni copias de seguridad, ni integraciones externas. Nada está desplegado.

Documentación: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```bash
npm install && npm run db:setup && npm run migrate && npm run seed && npm test
```

Datos y precios de demostración son ficticios. Los pagos son simulados y la base de datos impide registrar pagos reales.
