#!/usr/bin/env bash
# Creates the two database roles and the databases School OS needs.
# Run once per machine, as a PostgreSQL superuser:
#   npm run db:setup
#
# - school_os_owner owns the tables and runs migrations.
# - school_os_app is what the running app connects as. It cannot bypass the
#   row-level security that keeps each school's data apart, and it has no
#   DELETE permission (records are archived, never deleted).
#
# Passwords come from the environment (see .env.example); none are kept here.
set -euo pipefail

if [ -f .env ]; then set -a; . ./.env; set +a; fi

: "${DB_OWNER_PASSWORD:?Set DB_OWNER_PASSWORD (see .env.example)}"
: "${DB_APP_PASSWORD:?Set DB_APP_PASSWORD (see .env.example)}"
PSQL="${PSQL:-psql}"
DATABASES="${DATABASES:-school_os school_os_test}"

$PSQL -v ON_ERROR_STOP=1 -v owner_pw="$DB_OWNER_PASSWORD" -v app_pw="$DB_APP_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE school_os_owner LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'school_os_owner') \gexec
SELECT 'CREATE ROLE school_os_app LOGIN NOBYPASSRLS' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'school_os_app') \gexec
ALTER ROLE school_os_owner WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'owner_pw';
ALTER ROLE school_os_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'app_pw';
SQL

for db in $DATABASES; do
  exists=$($PSQL -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'")
  if [ "$exists" != "1" ]; then
    $PSQL -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db OWNER school_os_owner"
  fi
  $PSQL -v ON_ERROR_STOP=1 -d "$db" -c "GRANT CONNECT ON DATABASE $db TO school_os_app; ALTER SCHEMA public OWNER TO school_os_owner; GRANT USAGE ON SCHEMA public TO school_os_app;"
done

echo "Database roles and databases are ready: $DATABASES"
