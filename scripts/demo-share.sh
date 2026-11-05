#!/usr/bin/env bash
# Enciende la demo en tu Mac y obtiene una dirección pública TEMPORAL (Cloudflare Quick Tunnel, gratis).
# Uso (desde cualquier carpeta):   bash ~/Projects/studentul-botiq-hotel/scripts/demo-share.sh
# Variables opcionales (solo para pruebas): SKIP_DOCKER=1  SKIP_TUNNEL=1  PORT=3000
# No crea cuentas, no despliega nada permanente y no cuesta dinero. Datos ficticios, pagos simulados.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-3000}"
CRED="$ROOT/.demo-credentials"
LOG_API="${TMPDIR:-/tmp}/botiq-api.log"
LOG_TUN="${TMPDIR:-/tmp}/botiq-tunnel.log"
API_PID=""; TUN_PID=""

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
cleanup() {
  [ -n "$TUN_PID" ] && kill "$TUN_PID" 2>/dev/null || true
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  echo; echo "Demo detenida. La dirección pública ya no funciona. (La base de datos Docker sigue encendida: 'docker compose stop db' para pararla.)"
}
trap cleanup EXIT INT TERM

wait_for() { # wait_for "descripcion" segundos comando...
  local what="$1" secs="$2"; shift 2
  for _ in $(seq 1 "$secs"); do "$@" >/dev/null 2>&1 && return 0; sleep 1; done
  fail "Tiempo agotado esperando: $what"
}

say "1/8 Comprobando herramientas"
for t in node npm curl openssl; do command -v "$t" >/dev/null || fail "Falta '$t'."; done
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then fail "El puerto $PORT ya está en uso. Ciérralo o usa PORT=3001 bash $0"; fi
[ -d node_modules ] || { say "Instalando dependencias (npm install)"; npm install --no-audit --no-fund; }

if [ "${SKIP_DOCKER:-0}" != "1" ]; then
  say "2/8 Docker y base de datos PostgreSQL"
  command -v docker >/dev/null || fail "Falta Docker. Instala Colima + Docker o Docker Desktop."
  if ! docker info >/dev/null 2>&1; then
    command -v colima >/dev/null || fail "Docker no está encendido y no encuentro 'colima'. Abre Docker Desktop y repite."
    say "Arrancando Colima (la primera vez tarda unos minutos)"
    colima start
  fi
  docker compose up -d db
  wait_for "PostgreSQL" 90 docker compose exec -T db pg_isready -U postgres
  docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 < infra/db/init.sql >/dev/null
else
  say "2/8 (omitido) Docker: se usa el PostgreSQL local ya existente"
fi

say "3/8 Migraciones"
npm run --silent migrate

say "4/8 Claves de acceso (nuevas y aleatorias, guardadas en .demo-credentials)"
if [ ! -s "$CRED" ]; then
  umask 077
  {
    echo "DEMO_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')"
    echo "PLATFORM_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')"
  } > "$CRED"
fi
chmod 600 "$CRED"
# shellcheck disable=SC1090
set -a; . "$CRED"; set +a
npm run --silent seed >/dev/null

say "5/8 Compilando la web"
npm run --silent build -w apps/web >/dev/null

start_api() { # start_api [ALLOWED_ORIGINS]
  [ -n "$API_PID" ] && { kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true; }
  ALLOWED_ORIGINS="${1:-http://localhost:$PORT}" SESSION_COOKIE_SECURE=true TRUST_PROXY=true PORT="$PORT" \
    npm start -w apps/api >"$LOG_API" 2>&1 &
  API_PID=$!
  wait_for "la API" 40 curl -fsS "http://127.0.0.1:$PORT/api/health" || { tail -20 "$LOG_API"; fail "La API no arrancó."; }
}
say "6/8 Arrancando la aplicación"
start_api
echo "Aplicación local lista en http://127.0.0.1:$PORT"

URL="http://127.0.0.1:$PORT (solo en este Mac)"
if [ "${SKIP_TUNNEL:-0}" != "1" ]; then
  say "7/8 Dirección pública temporal (Cloudflare Quick Tunnel)"
  if ! command -v cloudflared >/dev/null; then
    command -v brew >/dev/null || fail "Falta 'cloudflared' y no hay Homebrew. Instálalo desde developers.cloudflare.com/tunnel"
    brew install cloudflared
  fi
  cloudflared tunnel --url "http://localhost:$PORT" >"$LOG_TUN" 2>&1 &
  TUN_PID=$!
  for _ in $(seq 1 60); do
    PUB="$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$LOG_TUN" 2>/dev/null | head -1 || true)"
    [ -n "${PUB:-}" ] && break
    sleep 1
  done
  [ -n "${PUB:-}" ] || { tail -20 "$LOG_TUN"; fail "No se obtuvo la dirección pública (¿firewall o WARP bloqueando cloudflared?)."; }
  URL="$PUB"

  say "8/8 Comprobando la dirección pública"
  HOST="${PUB#https://}"
  # 1) El túnel debe estar conectado con Cloudflare (esto no depende del DNS de tu Mac).
  for _ in $(seq 1 60); do grep -q "Registered tunnel connection" "$LOG_TUN" 2>/dev/null && break; sleep 1; done
  if ! grep -q "Registered tunnel connection" "$LOG_TUN" 2>/dev/null; then
    echo "---- últimas líneas de cloudflared ----"; tail -25 "$LOG_TUN"; echo "---------------------------------------"
    fail "cloudflared no logró conectar con Cloudflare. Suele deberse a un firewall, VPN o WARP que bloquea el puerto 7844. Prueba sin VPN/WARP o desde otra red (p. ej. compartiendo datos del iPhone)."
  fi
  echo "Túnel conectado con Cloudflare."
  # 2) Permitir el origen público (inofensivo aunque no hiciera falta).
  start_api "$PUB"
  # 3) Comprobación desde este Mac: primero con el DNS normal y, si falla, saltándose el DNS local (1.1.1.1).
  login_code() { curl -s -m 15 -o /dev/null -w '%{http_code}' -X POST -H "Origin: $PUB" -H 'content-type: application/json' -d '{"email":"x@y.test","password":"x"}' "$@" "$PUB/api/auth/login" 2>/dev/null || true; }
  CODE=""
  for _ in $(seq 1 15); do CODE="$(login_code)"; [ "$CODE" = "401" ] && break; sleep 2; done
  if [ "$CODE" != "401" ] && command -v dig >/dev/null; then
    IP="$(dig +short @1.1.1.1 "$HOST" 2>/dev/null | grep -E '^[0-9.]+$' | head -1 || true)"
    if [ -n "$IP" ]; then
      CODE="$(login_code --resolve "$HOST:443:$IP")"
      if [ "$CODE" = "401" ]; then
        echo "AVISO: la dirección funciona, pero el DNS de ESTE Mac aún no la conoce. Ábrela desde el iPhone con datos móviles o espera 1-2 minutos."
        echo "       Si sigue sin abrir aquí: sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder"
      fi
    fi
  fi
  if [ "$CODE" != "401" ]; then
    echo "AVISO: no pude confirmar desde este Mac el acceso a la dirección pública (código '$CODE')."
    echo "       El túnel está conectado; ábrela desde otro dispositivo (iPhone con datos móviles). Si no abre, copia esto y envíamelo:"
    echo "       tail -25 $LOG_TUN   y   tail -25 $LOG_API"
  else
    echo "Comprobación correcta: la dirección pública responde y el login funciona."
  fi
else
  say "7/8 y 8/8 (omitidos) Túnel público"
fi

cat <<EOF

────────────────────────────────────────────────────────────
  DEMO LISTA — Zanzibar Boutique Hotel (datos ficticios)

  Dirección web (envíala al propietario):
    $URL

  Panel de administración:
    $URL/#/admin
    Usuario propietario:  owner@zanzibar.test
    Usuario recepción:    reception@zanzibar.test
    Clave de usuarios:    $DEMO_PASSWORD

    Administrador de plataforma: platform@botiq.test
    Clave:                $PLATFORM_PASSWORD

  Envía las claves por un canal DISTINTO al del enlace.
  Mantén esta ventana abierta y el Mac encendido y sin suspender.
  La dirección cambia cada vez que repites el script.
  Para parar: pulsa Ctrl+C.
────────────────────────────────────────────────────────────
EOF
wait "$API_PID"
