# Publicar la demo (Neon + Vercel Hobby)

> **Estado: preparado, NO desplegado y NO verificado en Vercel ni en Neon.** Lo verificado hasta ahora es solo local (48 tests de API, 25 comprobaciones de navegador, humo contra servidor local). Los puntos sin verificar están marcados con ⚠️. Si algo falla, pega el log y se corrige.

Los secretos (contraseñas, cadenas de conexión) **se escriben solo en tu terminal y en el panel de Vercel**, nunca en un chat.

## Coste y condiciones (verificadas en fuentes oficiales)
- Neon Free: 0 USD; 1 GB por proyecto, 100 CU-hours/mes, el cómputo se suspende tras 5 min sin uso (la primera petición tarda más), 6 h de restauración, sin SLA. [Planes de Neon](https://neon.com/docs/introduction/plans)
- Vercel Hobby: 0 USD, pero **solo uso no comercial**; Vercel puede pausar la cuenta. Enseñar el proyecto a un posible cliente puede considerarse comercial: zona gris sin resolución oficial. [Fair Use de Vercel](https://vercel.com/docs/limits/fair-use-guidelines)
- Alternativa si Vercel Hobby no encaja: plan de pago de Vercel (precio sin verificar) u otro hosting.

## Pasos

### 1. Base de datos en Neon
1. Crea un proyecto en Neon (plan Free). Anota el **host directo** y el **host pooler** (el del pooler lleva `-pooler`).
2. En tu Mac, en la carpeta del proyecto (usa la conexión **directa** del propietario de la BD):
   ```bash
   read -s "ADMIN_DATABASE_URL?Conexión DIRECTA de Neon: "; export ADMIN_DATABASE_URL
   export APP_DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=')"
   export DEMO_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=')"
   export PLATFORM_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=')"
   npm install
   npx tsx apps/api/src/remote-setup.ts --yes
   echo "APP_DB_PASSWORD=$APP_DB_PASSWORD"; echo "DEMO_PASSWORD=$DEMO_PASSWORD"; echo "PLATFORM_PASSWORD=$PLATFORM_PASSWORD"
   ```
   Guarda esas tres contraseñas en tu gestor de contraseñas. El script crea el rol `botiq_app` **sin SUPERUSER ni BYPASSRLS**, aplica las migraciones y carga los datos ficticios.
   ⚠️ No verificado en Neon: que `CREATE EXTENSION btree_gist` y `citext` estén permitidas al propietario por defecto (si falla, el mensaje lo dirá).

### 2. Hosting en Vercel
1. Importa el repositorio `leonardospain/studentul-botiq-hotel` (rama indicada) en Vercel, preset **Other**, raíz del repositorio. `vercel.json` ya define build, salida y reescritura de `/api/*`.
2. Variables de entorno (Production):
   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | Cadena **pooler** de Neon cambiando usuario a `botiq_app` y su contraseña (`APP_DB_PASSWORD`) |
   | `SESSION_COOKIE_SECURE` | `true` |
   | `TRUST_PROXY` | `true` |
   | `DB_POOL_MAX` | `3` |
   | `NODE_ENV` | `production` |
3. Despliega.
   ⚠️ No verificado: que Vercel detecte `api/index.ts` y resuelva los imports con extensión `.js` hacia `.ts`; que la reescritura conserve la URL original.
   ⚠️ No verificado: que el pooler de Neon respete `set_config(..., true)` por transacción (la documentación de Neon indica que `SET` de sesión no funciona en el pooler; este proyecto solo usa estado local a la transacción). El paso 3 lo comprueba.

#### Alternativa si la otra cuenta de Vercel no puede leer el repositorio de GitHub
Despliega desde tu carpeta local con la CLI (no necesita enlazar GitHub). ⚠️ No verificado:
```bash
npx vercel login
```
```bash
npx vercel link
```
Pon las variables de la tabla anterior en el panel de Vercel (Project → Settings → Environment Variables), no en la terminal. Después:
```bash
npx vercel --prod
```

### 3. Comprobar que el aislamiento funciona en producción
```bash
BASE=https://TU-PROYECTO.vercel.app DEMO_PASSWORD="…" PLATFORM_PASSWORD="…" node scripts/remote-smoke.mjs
```
Si alguna comprobación de aislamiento falla, **no compartas la URL**: avisa antes.

### 4. Compartir con el propietario
- Envíale la URL por un canal y las credenciales por otro. Usuarios demo: `owner@zanzibar.test` (propietario), `reception@zanzibar.test`, `housekeeping@zanzibar.test`, `accounting@zanzibar.test`, `manager@zanzibar.test`; el administrador de plataforma `platform@botiq.test` tiene contraseña distinta.
- Los datos son ficticios y los pagos simulados; la web lo indica en cada pantalla y tiene `noindex`.
- ⚠️ Comprueba en Vercel la configuración de *Deployment Protection* de las URLs de preview (no verificada aquí).

## Riesgos conocidos de la demo pública
- El login es público; la seguridad depende de que `DEMO_PASSWORD` sea larga y secreta. Cámbiala al terminar la demo.
- Los limitadores de intentos (login y reserva pública) viven en memoria de cada instancia serverless: frenan abusos básicos, no son una defensa fuerte.
- Sin copias de seguridad propias (solo la restauración de 6 h de Neon Free). Es aceptable porque los datos son ficticios; **no** apto para datos reales.
- Primera carga lenta tras inactividad (Neon suspende el cómputo).

## Cómo deshacerlo
Elimina el proyecto en Vercel y el proyecto en Neon. No quedan datos reales ni recursos de pago.
