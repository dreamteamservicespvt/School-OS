#!/usr/bin/env bash
# Starts the School OS test copy: its own database, the demo school, the
# background worker and the web app. Used by deploy/test-copy/Dockerfile.
set -euo pipefail
cd "$(dirname "$0")/../.."

key() { node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"; }

# A fresh database inside the container, reachable only from inside it.
export PGDATA="$HOME/pgdata"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  initdb -U postgres --auth=trust -D "$PGDATA" > /dev/null
fi
pg_ctl -D "$PGDATA" -l "$HOME/postgres.log" -w -o "-c listen_addresses=127.0.0.1 -k /tmp" start

export DB_OWNER_PASSWORD="${DB_OWNER_PASSWORD:-$(key | tr -d '/+=')}"
export DB_APP_PASSWORD="${DB_APP_PASSWORD:-$(key | tr -d '/+=')}"
export DATABASE_URL="postgresql://school_os_app:$DB_APP_PASSWORD@127.0.0.1:5432/school_os"
export MIGRATION_DATABASE_URL="postgresql://school_os_owner:$DB_OWNER_PASSWORD@127.0.0.1:5432/school_os"
export FIELD_ENCRYPTION_KEY="${FIELD_ENCRYPTION_KEY:-$(key)}"
export PARENT_LINK_SECRET="${PARENT_LINK_SECRET:-$(key)}"
export FILE_LINK_SECRET="${FILE_LINK_SECRET:-$(key)}"
export DEMO_PASSWORD="${DEMO_PASSWORD:-SchoolOS@2026}"
# Hugging Face tells the container its public address in SPACE_HOST.
if [ -z "${APP_URL:-}" ]; then
  if [ -n "${SPACE_HOST:-}" ]; then export APP_URL="https://$SPACE_HOST"; else export APP_URL="http://localhost:${PORT:-7860}"; fi
fi

PSQL="psql -h 127.0.0.1 -U postgres" DATABASES=school_os bash scripts/setup-db.sh
npm run db:migrate
# The demo seed refuses to run in production; this database is a throwaway demo.
NODE_ENV=development npm run db:seed

export NODE_ENV=production
npm run worker &
exec npx next start -H 0.0.0.0 -p "${PORT:-7860}"
