#!/usr/bin/env bash
# Demo morning 31-10: back up the demo database, reload fresh demo data dated today,
# rebuild the SSD copy with the latest commits, and start it. Local database only.
set -uo pipefail
P=/d/all/Projects/School-OS
B=$P/tools/pg16/pgsql/bin
cd $P
export DATABASE_URL=$(grep -o '^DATABASE_URL=.*' .env | cut -d= -f2- | tr -d '"')
export MIGRATION_DATABASE_URL=$(grep -o '^MIGRATION_DATABASE_URL=.*' .env | cut -d= -f2- | tr -d '"')
case "$MIGRATION_DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "REFUSING: not local"; exit 1 ;; esac
case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "REFUSING: not local"; exit 1 ;; esac
MURL=${MIGRATION_DATABASE_URL%%\?*}

echo "STEP backup"
[ "${SKIP_BACKUP:-}" = 1 ] || $B/pg_dump -h localhost -U postgres -d school_os -Fc -f /c/Users/chala/sos-snap/school_os-$(date +%F)-before-reseed.dump || { echo "FAILED backup"; exit 1; }

echo "STEP stop app"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'next.*start|next-server|start-server' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }"

echo "STEP drop schema"
$B/psql -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" -d "$MURL" || { echo "FAILED drop"; exit 1; }
echo "STEP migrate"
npx prisma migrate deploy > $P/tools/migrate.log 2>&1 || { echo "FAILED migrate"; exit 1; }
echo "STEP seed"
STORAGE_DIR=D:/all/Projects/School-OS/storage npx prisma db seed > $P/tools/seed.log 2>&1 || { echo "FAILED seed"; exit 1; }

echo "STEP copy to SSD"
robocopy 'D:\all\Projects\School-OS' 'C:\Users\chala\sos-build' /MIR /XD .git node_modules .next tools storage qa-output .claude /XF build-and-start.sh /NFL /NDL /NJH /NJS /NP > /dev/null
echo "STEP build"
cd /c/Users/chala/sos-build
NODE_OPTIONS=--max-old-space-size=6144 npx next build > $P/tools/build.log 2>&1
echo "BUILD EXIT $?" >> $P/tools/build.log
grep -q "BUILD EXIT 0" $P/tools/build.log || { echo "FAILED build"; exit 1; }
echo "DONE built"
