#!/usr/bin/env bash
# Crea roles y bases locales. Usa un PostgreSQL local (Linux: usuario postgres) o, si defines
# PGSUPER_URL, esa conexión de superusuario (p. ej. el contenedor de docker-compose.yml).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "${PGSUPER_URL:-}" ]; then
  psql "$PGSUPER_URL" -v ON_ERROR_STOP=1 -f infra/db/init.sql
else
  su postgres -c "psql -v ON_ERROR_STOP=1 -f $(pwd)/infra/db/init.sql"
fi
echo "Roles y bases listos."
