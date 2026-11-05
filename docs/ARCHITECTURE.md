# STUDENTUL BOTIQ HOTEL — Arquitectura

SaaS multi-tenant de gestión hotelera (PMS) para hoteles boutique. Primer inquilino de demostración: **Zanzibar Boutique Hotel** (Paje, Zanzíbar, 15 habitaciones, datos ficticios).

> Requisitos de partida: el encargo del propietario y el texto de configuración pegado en la sesión (monedas USD/TZS, idiomas web RO/EN/ES/IT/FR, administración en rumano, pagos simulados, módulos de back office). Las dos conversaciones de ChatGPT enlazadas **no se han podido leer** (el host no está permitido en la red de la sesión); cuando se aporten, se contrastarán con este documento.

## 1. Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| Multi-tenancy | Una base de datos, esquema compartido, `hotel_id` en toda tabla de negocio | Barato de operar y escalar; permite miles de hoteles |
| Aislamiento | **PostgreSQL Row-Level Security** (`FORCE`) + claves foráneas compuestas `(hotel_id, id)` | El aislamiento no depende de que cada consulta recuerde un `WHERE hotel_id` |
| Rol de BD | `botiq_app` sin superusuario ni `BYPASSRLS`; migraciones con `botiq_owner` | RLS no puede saltarse desde la aplicación |
| Sin doble reserva | `EXCLUDE USING gist (room_id, daterange(check_in, check_out))` + bloqueo asesor por hotel | La BD es la última garantía, incluso con concurrencia |
| Dinero | Enteros en centavos USD; sin floats | Sin errores de redondeo |
| Pagos | Solo **simulados** (`CHECK (simulated)`) | Ninguna pasarela conectada; no se guardan datos de tarjeta |
| Auditoría | `audit_log` append-only (la app solo tiene `INSERT/SELECT`) | Trazabilidad no manipulable desde la aplicación |
| Sesiones | Token opaco en cookie `HttpOnly; SameSite=Lax`; en BD solo su SHA-256; revocables | Sin JWT no revocables |
| Contraseñas | scrypt (N=16384, r=8, p=1) con sal | Incluido en Node; sin dependencias nativas |
| API | Node 22 + TypeScript + Fastify 5 + `pg` + zod | Pequeño, tipado, rápido |
| Tests | Vitest contra PostgreSQL real (no mocks) | RLS y exclusión solo se prueban en una BD real |

## 2. Modelo de datos

```
plans ─┐
       ├─ hotels (tenant) ─┬─ subscriptions (simulada)
users ─┴─ memberships ─────┤   role: owner|manager|receptionist|housekeeping|maintenance|accountant
sessions                   ├─ room_types ─ rate_periods (temporadas, sin solapes)
audit_log                  ├─ rooms (estado + limpieza)
                           ├─ guests
                           └─ reservations ─┬─ payments (simulados, libro sin UPDATE/DELETE)
                                            └─ extras (excursiones, transfers…)
```

Un usuario es global; su rol vive en `memberships` por hotel (un mismo usuario puede trabajar en varios). `is_platform_admin` da acceso a la administración central.

## 3. Seguridad

- **Autenticación**: sesión por cookie; limitador de intentos (5/15 min por IP+email; en memoria, ver riesgos); respuesta idéntica para usuario inexistente y contraseña errónea.
- **Autorización**: matriz rol→permiso en `src/permissions.ts`, comprobada en cada ruta (`guard()`); acceso a un hotel ajeno devuelve el mismo 403 exista o no el hotel.
- **CSRF**: `SameSite=Lax` + rechazo de mutaciones con `Origin` no permitido.
- **Cabeceras**: `nosniff`, `X-Frame-Options: DENY`, `no-store`.
- **Límites SaaS**: habitaciones y personal por plan (HTTP 402 al superarlos).
- **Auditoría**: toda mutación escribe `audit_log` en la misma transacción.

## 4. Verificado (tests contra PostgreSQL 16)

37 pruebas pasan (`npm test`): aislamiento por API y por RLS, escritura cruzada bloqueada por RLS y FK, auditoría inmutable, rol de BD sin superusuario, pagos reales bloqueados, permisos por rol, límites de plan, cálculo de tarifas por temporada, disponibilidad, **12 reservas concurrentes sobre 3 suites → exactamente 3 éxitos**, cambio de fechas, cancelación, check-in/out con reglas (limpieza, saldo, fecha), pagos y reembolsos simulados, extras, informes.

## 5. Estado por fase

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Arquitectura, entorno local | Hecho |
| 1 | Núcleo SaaS: tenants, auth, roles, permisos, auditoría, planes | Hecho y probado |
| 2 | Habitaciones, tarifas, disponibilidad, reservas, check-in/out, pagos simulados, extras, limpieza, informes | Hecho y probado (API) |
| 3 | Web pública + motor de reservas (5 idiomas, USD/TZS) | **Pendiente** |
| 4 | Panel administrativo en rumano (UI) | **Pendiente** |
| 5 | Personal/turnos, inventario, contabilidad, mantenimiento | **Pendiente** (hoy solo hay rol `maintenance` y estado de limpieza) |
| 6 | Copias de seguridad, observabilidad, despliegue | **Pendiente**; nada se despliega sin aprobación |
| — | Channel manager / canales externos | **No implementado**; sin integración real no se afirma ninguna |

## 6. Riesgos conocidos y decisiones abiertas

1. **Limitador de login en memoria**: válido para un proceso; con varias instancias hay que moverlo a Redis/BD.
2. **Plazos de reserva**: sin pasarela real no hay depósitos ni políticas de cancelación con cobro.
3. **TZS**: hoy todo se almacena en USD; la conversión a TZS (tabla de tipos de cambio con fecha) está pendiente y requiere una fuente de tipos de cambio verificada.
4. **Alta de personal**: no hay invitaciones por correo (no se envían correos); el propietario fija una contraseña inicial.
5. **Copias de seguridad**: no implementadas. Requieren decidir proveedor (coste).
6. **Escalado**: un solo PostgreSQL con RLS es adecuado para cientos de hoteles; más allá habría que particionar por `hotel_id` o separar tenants grandes.

## 7. Alternativas descartadas

| Opción | Pros | Contras |
|---|---|---|
| BD por hotel | Aislamiento físico, backups por cliente | Coste y migraciones × N; informes globales difíciles |
| Esquema por hotel | Buen aislamiento lógico | Migraciones × N; límite práctico de esquemas |
| Filtro `WHERE hotel_id` solo en código | Más simple | Un olvido filtra datos entre clientes (descartado) |

## 8. Ejecutar en local

```bash
npm install
npm run db:setup      # roles y bases botiq / botiq_test (PostgreSQL local o PGSUPER_URL)
npm run migrate
npm run seed          # datos FICTICIOS; imprime la contraseña demo
npm run dev           # API en http://127.0.0.1:3000
npm test
```
