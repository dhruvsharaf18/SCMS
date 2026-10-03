#!/usr/bin/env bash
# SRS 11.5: stop api, drop/recreate the database, restart (re-seeds). Target < 30 s.
#
# Usage:
#   ./reset_db.sh          # demo mode (docker-compose.yml only)
#   ./reset_db.sh --dev    # keeps the docker-compose.dev.yml port overrides in place
set -euo pipefail
cd "$(dirname "$0")"

APP_DB_USER="${APP_DB_USER:-ccms_app}"

# Without this, `docker compose up -d api` below would recreate the container from the base
# file alone and silently drop the dev override's 127.0.0.1:8000 mapping.
if [ "${1:-}" = "--dev" ]; then
  dc() { docker compose -f docker-compose.yml -f docker-compose.dev.yml "$@"; }
else
  dc() { docker compose "$@"; }
fi

echo "==> stopping api"
dc stop api

# psql only interpolates :"var" for input read from stdin; with -c the string goes
# straight to the server, so these must be heredocs (same form as db/init/01-app-role.sh).
echo "==> dropping and recreating database"
dc exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'EOSQL'
DROP DATABASE IF EXISTS ccms WITH (FORCE);
CREATE DATABASE ccms OWNER postgres;
EOSQL

dc exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d ccms -v app_user="$APP_DB_USER" <<'EOSQL'
GRANT CONNECT ON DATABASE ccms TO :"app_user";
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
EOSQL

echo "==> starting api (create_all + seed)"
dc up -d api

echo -n "==> waiting for api"
for _ in $(seq 1 30); do
  if dc exec -T api python -c \
      "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" \
      >/dev/null 2>&1; then
    echo " ok"
    echo "==> done"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo " timed out"
exit 1
