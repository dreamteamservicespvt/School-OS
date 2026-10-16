#!/usr/bin/env bash
# Wipes the local everyday database and rebuilds it with the demo school.
# Never point this at a real school's database.
set -euo pipefail
if [ -f .env ]; then set -a; . ./.env; set +a; fi
case "$MIGRATION_DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Refusing: this only runs against a database on this computer."; exit 1 ;;
esac
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
npx prisma migrate deploy
npx prisma db seed
